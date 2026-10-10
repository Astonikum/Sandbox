#include "constraints.hpp"

namespace {
void solveHinge(Body &bodyA, Body *bodyB, const Link &link, int source) {
  Vec2 offsetA = bodyA.rotate(link.localAnchorA),
       offsetB = bodyB ? bodyB->rotate(link.localAnchorB) : Vec2{},
       separation = (bodyB ? bodyB->position + offsetB : link.anchor) - (bodyA.position + offsetA);
  double inverseMassA = bodyA.inverseMass(), inverseMassB = bodyB ? bodyB->inverseMass() : 0,
         inverseInertiaA = bodyA.inverseInertia(),
         inverseInertiaB = bodyB ? bodyB->inverseInertia() : 0;
  double xx = inverseMassA + inverseMassB + offsetA.y * offsetA.y * inverseInertiaA +
              offsetB.y * offsetB.y * inverseInertiaB,
         yy = inverseMassA + inverseMassB + offsetA.x * offsetA.x * inverseInertiaA +
              offsetB.x * offsetB.x * inverseInertiaB,
         xy = -offsetA.x * offsetA.y * inverseInertiaA - offsetB.x * offsetB.y * inverseInertiaB,
         determinant = xx * yy - xy * xy;
  if (determinant > 1e-20) {
    auto solve = [&](Vec2 rightHandSide) {
      return Vec2{(yy * rightHandSide.x - xy * rightHandSide.y) / determinant,
                  (xx * rightHandSide.y - xy * rightHandSide.x) / determinant};
    };
    Vec2 correction = solve(separation * .8);
    bodyA.position = bodyA.position + correction * inverseMassA;
    bodyA.angle += cross(offsetA, correction) * inverseInertiaA;
    if (bodyB) {
      bodyB->position = bodyB->position - correction * inverseMassB;
      bodyB->angle -= cross(offsetB, correction) * inverseInertiaB;
    }
    Vec2 impulse =
        solve((bodyB ? pointVelocity(*bodyB, offsetB) : Vec2{}) - pointVelocity(bodyA, offsetA));
    applyImpulse(bodyA, impulse, offsetA, ForceCategory::Joint, source);
    if (bodyB)
      applyImpulse(*bodyB, impulse * (-1), offsetB, ForceCategory::Joint, source);
  }

}
void solveWeld(Body &a, Body *b, const Link &link, int source) {
  const double ma = a.inverseMass(), mb = b ? b->inverseMass() : 0,
               ia = a.inverseInertia(), ib = b ? b->inverseInertia() : 0, inertia = ia + ib;
  if (inertia <= 0) { solveHinge(a, b, link, source); return; }
  for (bool position : {true, false}) {
    const Vec2 ra = a.rotate(link.localAnchorA), rb = b ? b->rotate(link.localAnchorB) : Vec2{},
               coupling = perpendicular(ra) * ia + perpendicular(rb) * ib;
    const double xx = ma + mb + ra.y * ra.y * ia + rb.y * rb.y * ib - coupling.x * coupling.x / inertia,
                 yy = ma + mb + ra.x * ra.x * ia + rb.x * rb.x * ib - coupling.y * coupling.y / inertia,
                 xy = -ra.x * ra.y * ia - rb.x * rb.y * ib - coupling.x * coupling.y / inertia,
                 determinant = xx * yy - xy * xy;
    if (determinant <= 1e-20) return;
    const double angular = position ? ((b ? b->angle : 0) - a.angle - link.referenceAngle) * .8
                                    : (b ? b->angularVelocity : 0) - a.angularVelocity;
    const Vec2 linear = position ? ((b ? b->position + rb : link.anchor) - a.position - ra) * .8
                                : (b ? pointVelocity(*b, rb) : Vec2{}) - pointVelocity(a, ra),
               rhs = linear - coupling * (angular / inertia),
               impulse{(yy * rhs.x - xy * rhs.y) / determinant, (xx * rhs.y - xy * rhs.x) / determinant};
    const double torque = (angular - dot(coupling, impulse)) / inertia;
    if (position) {
      a.position = a.position + impulse * ma;
      a.angle += (cross(ra, impulse) + torque) * ia;
      if (b) {
        b->position = b->position - impulse * mb;
        b->angle -= (cross(rb, impulse) + torque) * ib;
      }
    } else {
      applyImpulse(a, impulse, ra, ForceCategory::Joint, source);
      a.angularVelocity += torque * ia;
      a.torqueImpulse += torque;
      if (b) {
        applyImpulse(*b, impulse * (-1), rb, ForceCategory::Joint, source);
        b->angularVelocity -= torque * ib;
        b->torqueImpulse -= torque;
      }
    }
  }
}
void solveSpringGuide(Body &a, Body *b, const Link &link, int source) {
  const Vec2 ra = a.rotate(link.localAnchorA),
             rb = b ? b->rotate(link.localAnchorB) : Vec2{},
             separation = (b ? b->position + rb : link.anchor) - a.position - ra;
  const bool rotating = link.pulley >= 0;
  const double angle = link.referenceAngle + (rotating ? a.angle : 0);
  const Vec2 axis{std::cos(angle), std::sin(angle)}, normal = perpendicular(axis);
  const double lever = rotating ? dot(separation, axis) : 0,
               ja = -cross(ra, normal) - lever, jb = cross(rb, normal),
               mass = a.inverseMass() + (b ? b->inverseMass() : 0) +
                      ja * ja * a.inverseInertia() + (b ? jb * jb * b->inverseInertia() : 0);
  if (mass <= 1e-20) return;
  const double correction = -dot(separation, normal) * .8 / mass;
  a.position = a.position - normal * (correction * a.inverseMass());
  a.angle += ja * correction * a.inverseInertia();
  if (b) {
    b->position = b->position + normal * (correction * b->inverseMass());
    b->angle += jb * correction * b->inverseInertia();
  }
  const double speed = dot((b ? b->velocity : Vec2{}) - a.velocity, normal) +
                       ja * a.angularVelocity + (b ? jb * b->angularVelocity : 0),
               impulse = -speed / mass;
  applyImpulse(a, normal * (-impulse), ra, ForceCategory::Spring, source);
  a.angularVelocity -= lever * impulse * a.inverseInertia();
  a.torqueImpulse -= lever * impulse;
  if (b) applyImpulse(*b, normal * impulse, rb, ForceCategory::Spring, source);
}
void solveWrappedPulley(std::vector<Body> &bodies, Body &bodyA, Body *bodyB, const Link &link,
                        int source) {
  auto &pulley = bodies[link.pulley];
  double radius = pulley.width / 2;
  Vec2 offsetA = bodyA.rotate(link.localAnchorA),
       offsetB = bodyB->rotate(link.localAnchorB),
       strandA = bodyA.position + offsetA - pulley.position,
       strandB = bodyB->position + offsetB - pulley.position;
  double distanceA = length(strandA), distanceB = length(strandB);
  if (distanceA <= radius + 1e-7 || distanceB <= radius + 1e-7)
    return;
  double tangentAngleA = std::atan2(strandA.y, strandA.x) + std::acos(radius / distanceA),
         tangentAngleB = std::atan2(strandB.y, strandB.x) - std::acos(radius / distanceB),
         arc = tangentAngleB - tangentAngleA;
  while (arc < 0)
    arc += 2 * 3.141592653589793;
  while (arc > 2 * 3.141592653589793)
    arc -= 2 * 3.141592653589793;
  Vec2 directionA =
           normalized(strandA - Vec2{std::cos(tangentAngleA), std::sin(tangentAngleA)} * radius),
       directionB =
           normalized(strandB - Vec2{std::cos(tangentAngleB), std::sin(tangentAngleB)} * radius),
       pulleyDirection = (directionA + directionB) * (-1);
  double length = std::sqrt(distanceA * distanceA - radius * radius) +
                  std::sqrt(distanceB * distanceB - radius * radius) + radius * arc,
         error = length - link.length;
  if (error < -1e-5) {
    link.initialized = false;
    return;
  }
  double leverA = cross(offsetA, directionA), leverB = cross(offsetB, directionB),
         effectiveInverseMass = bodyA.inverseMass() + bodyB->inverseMass() +
                                dot(pulleyDirection, pulleyDirection) * pulley.inverseMass() +
                                leverA * leverA * bodyA.inverseInertia() +
                                leverB * leverB * bodyB->inverseInertia();
  if (effectiveInverseMass > 0) {
    double correction = std::max(0., error) * .8 / effectiveInverseMass;
    bodyA.position = bodyA.position - directionA * (correction * bodyA.inverseMass());
    bodyB->position = bodyB->position - directionB * (correction * bodyB->inverseMass());
    pulley.position = pulley.position - pulleyDirection * (correction * pulley.inverseMass());
    bodyA.angle -= leverA * correction * bodyA.inverseInertia();
    bodyB->angle -= leverB * correction * bodyB->inverseInertia();
    double impulse = -std::max(0., dot(pointVelocity(bodyA, offsetA), directionA) +
                                       dot(pointVelocity(*bodyB, offsetB), directionB) +
                                       dot(pulley.velocity, pulleyDirection)) /
                     effectiveInverseMass;
    applyImpulse(bodyA, directionA * impulse, offsetA, ForceCategory::Rope, source);
    applyImpulse(*bodyB, directionB * impulse, offsetB, ForceCategory::Rope, source);
    applyImpulse(pulley, directionA * (-impulse), perpendicular(directionA) * radius,
                 ForceCategory::Rope, source, 1);
    applyImpulse(pulley, directionB * (-impulse), perpendicular(directionB) * (-radius),
                 ForceCategory::Rope, source, 2);
  }

  double materialCoordinate =
      std::sqrt(distanceA * distanceA - radius * radius) - radius * tangentAngleA;
  if (!link.initialized) {
    link.material = materialCoordinate + radius * pulley.angle;
    link.initialized = true;
  }
  double rotationInverseMass = bodyA.inverseMass() + pulley.inverseMass() +
                               leverA * leverA * bodyA.inverseInertia() +
                               radius * radius * pulley.inverseInertia();
  if (rotationInverseMass > 0) {
    double correction =
        (materialCoordinate + radius * pulley.angle - link.material) * .8 / rotationInverseMass;
    bodyA.position = bodyA.position - directionA * (correction * bodyA.inverseMass());
    pulley.position = pulley.position + directionA * (correction * pulley.inverseMass());
    bodyA.angle -= leverA * correction * bodyA.inverseInertia();
    pulley.angle -= radius * correction * pulley.inverseInertia();
    double impulse = -(dot(pointVelocity(bodyA, offsetA) - pulley.velocity, directionA) +
                       radius * pulley.angularVelocity) /
                     rotationInverseMass;
    applyImpulse(bodyA, directionA * impulse, offsetA, ForceCategory::Rope, source);
    applyImpulse(pulley, directionA * (-impulse), perpendicular(directionA) * radius,
                 ForceCategory::Rope, source, 1);
  }
}
void solveIdealPulley(Body &bodyA, Body *bodyB, const Link &link, int source) {
  Vec2 distanceA = bodyA.position - link.anchor, distanceB = bodyB->position - link.anchor,
       directionA = normalized(distanceA), directionB = normalized(distanceB);
  double error = length(distanceA) + length(distanceB) - link.length,
         effectiveInverseMass = bodyA.inverseMass() + bodyB->inverseMass();
  if (error <= 0 || effectiveInverseMass == 0)
    return;
  double correction = error * .8 / effectiveInverseMass;
  bodyA.position = bodyA.position - directionA * (correction * bodyA.inverseMass());
  bodyB->position = bodyB->position - directionB * (correction * bodyB->inverseMass());
  double impulse =
      std::max(0., (dot(bodyA.velocity, directionA) + dot(bodyB->velocity, directionB)) /
                       effectiveInverseMass);
  applyImpulse(bodyA, directionA * (-impulse), {}, ForceCategory::Rope, source);
  applyImpulse(*bodyB, directionB * (-impulse), {}, ForceCategory::Rope, source);
}
void solveRope(Body &bodyA, Body *bodyB, const Link &link, int source) {
  Vec2 offsetA = bodyA.rotate(link.localAnchorA),
       offsetB = bodyB ? bodyB->rotate(link.localAnchorB) : Vec2{},
       pointA = bodyA.position + offsetA, pointB = bodyB ? bodyB->position + offsetB : link.anchor,
       separation = pointB - pointA;
  double distance = length(separation);
  if (distance < 1e-10)
    return;
  Vec2 direction = separation * (1 / distance);
  double error = distance - link.length;
  if (link.kind == LinkKind::Rope && error <= 0)
    return;
  double inverseMassA = bodyA.inverseMass(), inverseMassB = bodyB ? bodyB->inverseMass() : 0,
         inverseInertiaA = bodyA.inverseInertia(),
         inverseInertiaB = bodyB ? bodyB->inverseInertia() : 0, leverA = cross(offsetA, direction),
         leverB = cross(offsetB, direction),
         effectiveInverseMass = inverseMassA + inverseMassB + leverA * leverA * inverseInertiaA +
                                leverB * leverB * inverseInertiaB;
  if (effectiveInverseMass == 0)
    return;
  double correction = error * .8 / effectiveInverseMass;
  bodyA.position = bodyA.position + direction * (correction * inverseMassA);
  bodyA.angle += leverA * correction * inverseInertiaA;
  if (bodyB) {
    bodyB->position = bodyB->position - direction * (correction * inverseMassB);
    bodyB->angle -= leverB * correction * inverseInertiaB;
  }
  double impulse =
      dot((bodyB ? pointVelocity(*bodyB, offsetB) : Vec2{}) - pointVelocity(bodyA, offsetA),
          direction) /
      effectiveInverseMass;
  if (link.kind == LinkKind::Rope)
    impulse = std::max(0., impulse);
  applyImpulse(bodyA, direction * impulse, offsetA, ForceCategory::Rope, source);
  if (bodyB)
    applyImpulse(*bodyB, direction * (-impulse), offsetB, ForceCategory::Rope, source);
}
}
void solveConstraint(std::vector<Body> &bodies, const Link &link, int source) {
  if (link.bodyA < 0 || link.bodyA >= static_cast<int>(bodies.size()))
    return;
  Body &bodyA = bodies[link.bodyA];
  Body *bodyB = link.bodyB >= 0 ? &bodies[link.bodyB] : nullptr;
  if (link.kind == LinkKind::Hinge)
    solveHinge(bodyA, bodyB, link, source);
  else if (link.kind == LinkKind::Weld)
    solveWeld(bodyA, bodyB, link, source);
  else if (link.kind == LinkKind::SpringGuide)
    solveSpringGuide(bodyA, bodyB, link, source);
  else if (link.kind == LinkKind::Pulley && bodyB && link.pulley >= 0)
    solveWrappedPulley(bodies, bodyA, bodyB, link, source);
  else if (link.kind == LinkKind::Pulley && bodyB)
    solveIdealPulley(bodyA, bodyB, link, source);
  else
    solveRope(bodyA, bodyB, link, source);
}
