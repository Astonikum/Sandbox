#include "collision.hpp"
#include "geometry.hpp"
#include <array>

namespace {
using ContactManifold = ContactState;
struct ContactImpulses {
  double normal[2];
  double tangent;
  bool valid;
};
bool findContactNormal(const Body &bodyA, const Body &bodyB, Vec2 &normal, double &depth) {
  Vec2 separation = contactCenter(bodyB) - contactCenter(bodyA);
  depth = 1e30;
  std::array<Vec2, 5> axes = {bodyA.axis(0), bodyA.axis(1), bodyB.axis(0), bodyB.axis(1)};
  int axisCount = 4;
  bool circleA = bodyA.round(), circleB = bodyB.round();
  if (circleA && circleB) {
    axes[0] = length(separation) > 1e-10 ? normalized(separation) : Vec2{0, 1};
    axisCount = 1;
  } else if (circleA || circleB) {
    const Body &box = circleA ? bodyB : bodyA;
    const Body &circle = circleA ? bodyA : bodyB;
    Vec2 local = rotated(circle.position - contactCenter(box), -box.angle);
    Vec2 closest = {std::clamp(local.x, -box.width / 2, box.width / 2),
                    std::clamp(local.y, -contactHeight(box) / 2, contactHeight(box) / 2)};
    Vec2 corner = circle.position - (contactCenter(box) + rotated(closest, box.angle));
    if (length(corner) > 1e-9)
      axes[axisCount++] = normalized(corner);
  }
  for (int axisIndex = 0; axisIndex < axisCount; ++axisIndex) {
    Vec2 axis = axes[axisIndex];
    double overlap = projectedRadius(bodyA, axis) + projectedRadius(bodyB, axis) -
                     std::abs(dot(separation, axis));
    if (overlap < -0.00001)
      return false;
    if (overlap < depth) {
      depth = overlap;
      normal = axis * (dot(separation, axis) < 0 ? -1 : 1);
    }
  }
  if (length(normal) < .5)
    normal = {0, 1};
  return true;
}
ContactManifold buildManifold(const Body &bodyA, const Body &bodyB, Vec2 normal) {
  Vec2 tangent = perpendicular(normal);
  auto intervalA = supportInterval(bodyA, normal, tangent),
       intervalB = supportInterval(bodyB, normal * (-1), tangent);
  double lower = std::max(intervalA.first, intervalB.first),
         upper = std::min(intervalA.second, intervalB.second);
  if (lower > upper + 1e-6)
    return ContactManifold();
  int contacts = upper - lower > 1e-6 ? 2 : 1;
  ContactManifold manifold;
  manifold.normal = normal;
  double normalVelocity[2];
  for (int pointIndex = 0; pointIndex < contacts; ++pointIndex) {
    double tangentCoordinate = contacts == 1     ? (lower + upper) * .5
                               : pointIndex == 0 ? lower
                                                 : upper;
    double heightA = supportHeight(bodyA, normal, tangent, tangentCoordinate),
           heightB = -supportHeight(bodyB, normal * (-1), tangent, tangentCoordinate);
    if (heightA - heightB < -.00002)
      continue;
    manifold.points[manifold.count] =
        normal * ((heightA + heightB) * .5) + tangent * tangentCoordinate;
    manifold.offsetA[manifold.count] = manifold.points[manifold.count] - bodyA.position;
    manifold.offsetB[manifold.count] = manifold.points[manifold.count] - bodyB.position;
    normalVelocity[manifold.count] = dot(pointVelocity(bodyB, manifold.offsetB[manifold.count]) -
                                             pointVelocity(bodyA, manifold.offsetA[manifold.count]),
                                         normal);
    manifold.bounceVelocity[manifold.count] =
        normalVelocity[manifold.count] < -.1
            ? -std::min(bodyA.restitution, bodyB.restitution) * normalVelocity[manifold.count]
            : 0;
    ++manifold.count;
  }
  if (!manifold.count)
    return ContactManifold();
  Vec2 center =
      manifold.count == 2 ? (manifold.points[0] + manifold.points[1]) * .5 : manifold.points[0];
  manifold.frictionOffsetA = center - bodyA.position;
  manifold.frictionOffsetB = center - bodyB.position;
  return manifold;
}
ContactImpulses solveContactImpulses(const Body &bodyA, const Body &bodyB, Vec2 normal,
                                     const ContactManifold &manifold) {
  double inverseMassA = bodyA.inverseMass(), inverseMassB = bodyB.inverseMass();
  double normalImpulses[2]{};
  Vec2 tangent = perpendicular(normal);
  Vec2 frictionOffsetA = manifold.frictionOffsetA, frictionOffsetB = manifold.frictionOffsetB;
  double normalMass[2][2]{}, coupling[2]{};
  for (int i = 0; i < manifold.count; ++i) {
    for (int k = 0; k < manifold.count; ++k)
      normalMass[i][k] = inverseMassA + inverseMassB +
                         cross(manifold.offsetA[i], normal) * cross(manifold.offsetA[k], normal) *
                             bodyA.inverseInertia() +
                         cross(manifold.offsetB[i], normal) * cross(manifold.offsetB[k], normal) *
                             bodyB.inverseInertia();
    coupling[i] = cross(manifold.offsetA[i], normal) * cross(frictionOffsetA, tangent) *
                      bodyA.inverseInertia() +
                  cross(manifold.offsetB[i], normal) * cross(frictionOffsetB, tangent) *
                      bodyB.inverseInertia();
  }
  double tangentMass = inverseMassA + inverseMassB +
                       std::pow(cross(frictionOffsetA, tangent), 2) * bodyA.inverseInertia() +
                       std::pow(cross(frictionOffsetB, tangent), 2) * bodyB.inverseInertia();
  double tangentTarget =
             -dot(pointVelocity(bodyB, frictionOffsetB) - pointVelocity(bodyA, frictionOffsetA),
                  tangent),
         friction = std::sqrt(bodyA.friction * bodyB.friction), tangentImpulse = 0;
  double targetVelocity[2]{};
  tangentTarget += tangentMass * manifold.tangentImpulse;
  for (int i = 0; i < manifold.count; ++i) {
    targetVelocity[i] =
        manifold.bounceVelocity[i] -
        dot(pointVelocity(bodyB, manifold.offsetB[i]) - pointVelocity(bodyA, manifold.offsetA[i]),
            normal);
    targetVelocity[i] += coupling[i] * manifold.tangentImpulse;
    for (int k = 0; k < manifold.count; ++k)
      targetVelocity[i] += normalMass[i][k] * manifold.normalImpulse[k];
    tangentTarget += coupling[i] * manifold.normalImpulse[i];
  }
  bool solved = false;
  for (int sliding = 0; sliding < 3 && !solved; ++sliding) {
    double slope = sliding == 1 ? friction : -friction;
    for (int mask = (1 << manifold.count) - 1; mask >= 0 && !solved; --mask) {
      double candidateNormal[2]{}, candidateTangent = 0;
      if (mask == 3) {
        double m00 = normalMass[0][0], m01 = normalMass[0][1], m10 = normalMass[1][0],
               m11 = normalMass[1][1];
        double r0 = targetVelocity[0], r1 = targetVelocity[1];
        if (sliding == 0) {
          m00 -= coupling[0] * coupling[0] / tangentMass;
          m01 -= coupling[0] * coupling[1] / tangentMass;
          m10 -= coupling[1] * coupling[0] / tangentMass;
          m11 -= coupling[1] * coupling[1] / tangentMass;
          r0 -= coupling[0] * tangentTarget / tangentMass;
          r1 -= coupling[1] * tangentTarget / tangentMass;
        } else {
          m00 += coupling[0] * slope;
          m01 += coupling[0] * slope;
          m10 += coupling[1] * slope;
          m11 += coupling[1] * slope;
        }
        double determinant = m00 * m11 - m01 * m10;
        if (determinant <= 1e-20)
          continue;
        candidateNormal[0] = (m11 * r0 - m01 * r1) / determinant;
        candidateNormal[1] = (m00 * r1 - m10 * r0) / determinant;
      } else if (mask != 0) {
        int i = mask == 1 ? 0 : 1;
        double k = normalMass[i][i], r = targetVelocity[i];
        if (sliding == 0) {
          k -= coupling[i] * coupling[i] / tangentMass;
          r -= coupling[i] * tangentTarget / tangentMass;
        } else
          k += coupling[i] * slope;
        if (k <= 1e-20)
          continue;
        candidateNormal[i] = r / k;
      }
      if (candidateNormal[0] < -1e-12 || candidateNormal[1] < -1e-12)
        continue;
      candidateNormal[0] = std::max(0., candidateNormal[0]);
      candidateNormal[1] = std::max(0., candidateNormal[1]);
      candidateTangent = sliding == 0 ? (tangentTarget - coupling[0] * candidateNormal[0] -
                                         coupling[1] * candidateNormal[1]) /
                                            tangentMass
                                      : slope * (candidateNormal[0] + candidateNormal[1]);
      if (sliding == 0 &&
          std::abs(candidateTangent) > friction * (candidateNormal[0] + candidateNormal[1]) + 1e-12)
        continue;
      if (sliding != 0 &&
          slope * (tangentTarget - coupling[0] * candidateNormal[0] -
                   coupling[1] * candidateNormal[1] - tangentMass * candidateTangent) <
              -1e-12)
        continue;
      bool valid = true;
      for (int i = 0; i < manifold.count; ++i)
        if (!(mask & (1 << i)) && normalMass[i][0] * candidateNormal[0] +
                                          normalMass[i][1] * candidateNormal[1] +
                                          coupling[i] * candidateTangent <
                                      targetVelocity[i] - 1e-12)
          valid = false;
      if (!valid)
        continue;
      normalImpulses[0] = candidateNormal[0];
      normalImpulses[1] = candidateNormal[1];
      const double load = candidateNormal[0] + candidateNormal[1];
      const double roundoff = 64 * std::numeric_limits<double>::epsilon() * load;
      tangentImpulse = std::abs(candidateTangent) <= roundoff
                           ? 0
                           : std::clamp(candidateTangent, -friction * load, friction * load);
      solved = true;
    }
  }
  return {{normalImpulses[0], normalImpulses[1]}, tangentImpulse, solved};
}
void applyDelta(Body &bodyA, Body &bodyB, const ContactState &contact, double normalA,
                double normalB, double tangent, double rolling) {
  const double normalImpulses[] = {normalA, normalB};
  for (int i = 0; i < contact.count; ++i) {
    applyImpulse(bodyA, contact.normal * (-normalImpulses[i]), contact.offsetA[i]);
    applyImpulse(bodyB, contact.normal * normalImpulses[i], contact.offsetB[i]);
  }
  Vec2 tangentDirection = perpendicular(contact.normal);
  applyImpulse(bodyA, tangentDirection * (-tangent), contact.frictionOffsetA);
  applyImpulse(bodyB, tangentDirection * tangent, contact.frictionOffsetB);
  bodyA.angularVelocity += rolling * bodyA.inverseInertia();
  bodyB.angularVelocity -= rolling * bodyB.inverseInertia();
  bodyA.torqueImpulse += rolling;
  bodyB.torqueImpulse -= rolling;
}
void solveVelocity(Body &bodyA, Body &bodyB, ContactState &contact) {
  const auto impulses = solveContactImpulses(bodyA, bodyB, contact.normal, contact);
  if (!impulses.valid)
    return;
  applyDelta(bodyA, bodyB, contact, impulses.normal[0] - contact.normalImpulse[0],
             impulses.normal[1] - contact.normalImpulse[1],
             impulses.tangent - contact.tangentImpulse, 0);
  contact.normalImpulse[0] = impulses.normal[0];
  contact.normalImpulse[1] = impulses.normal[1];
  contact.tangentImpulse = impulses.tangent;
  if ((bodyA.round() || bodyB.round()) && bodyA.inverseInertia() + bodyB.inverseInertia() > 0) {
    const double radius = bodyA.round() && bodyB.round()
                              ? std::min(bodyA.width, bodyB.width) / 2
                              : (bodyA.round() ? bodyA.width : bodyB.width) / 2;
    constexpr double rollingResistance = .01;
    const double limit = rollingResistance * std::sqrt(bodyA.friction * bodyB.friction) * radius *
                         (contact.normalImpulse[0] + contact.normalImpulse[1]);
    const double rolling =
        std::clamp(contact.rollingImpulse + (bodyB.angularVelocity - bodyA.angularVelocity) /
                                                (bodyA.inverseInertia() + bodyB.inverseInertia()),
                   -limit, limit);
    applyDelta(bodyA, bodyB, contact, 0, 0, 0, rolling - contact.rollingImpulse);
    contact.rollingImpulse = rolling;
  }
}
void recordContact(Body &bodyA, Body &bodyB, const ContactState &contact, int source) {
  for (int i = 0; i < contact.count; ++i) {
    recordImpulse(bodyA, contact.normal * (-contact.normalImpulse[i]), contact.offsetA[i],
                  ForceCategory::Normal, source);
    recordImpulse(bodyB, contact.normal * contact.normalImpulse[i], contact.offsetB[i],
                  ForceCategory::Normal, source);
  }
  Vec2 tangent = perpendicular(contact.normal) * contact.tangentImpulse;
  recordImpulse(bodyA, tangent * (-1), contact.frictionOffsetA, ForceCategory::Friction, source);
  recordImpulse(bodyB, tangent, contact.frictionOffsetB, ForceCategory::Friction, source);
}
bool prepareContact(Body &bodyA, Body &bodyB, ContactState &contact, double dt) {
  if (bodyA.inverseMass() == 0 && bodyB.inverseMass() == 0)
    return false;
  Vec2 normal;
  double depth;
  if (!findContactNormal(bodyA, bodyB, normal, depth))
    return false;
  double inverseMassA = bodyA.inverseMass(), inverseMassB = bodyB.inverseMass();
  Vec2 correction = normal * (std::max(0., depth - .00001) * .6 / (inverseMassA + inverseMassB));
  bodyA.position = bodyA.position - correction * inverseMassA;
  bodyB.position = bodyB.position + correction * inverseMassB;
  if (!contact.active) {
    auto next = buildManifold(bodyA, bodyB, normal);
    if (!next.count)
      return false;
    const double tolerance = .05 * std::min({bodyA.width, bodyA.height, bodyB.width, bodyB.height});
    bool matched =
        next.count == contact.count && dot(next.normal, contact.normal) > .999 && contact.dt > 0;
    for (int i = 0; i < next.count && matched; ++i)
      matched = next.bounceVelocity[i] == 0 &&
                length(next.offsetA[i] - contact.offsetA[i]) < tolerance &&
                length(next.offsetB[i] - contact.offsetB[i]) < tolerance;
    if (matched) {
      const double ratio = std::clamp(dt / contact.dt, 0., 2.);
      for (int i = 0; i < next.count; ++i)
        next.normalImpulse[i] = contact.normalImpulse[i] * ratio;
      next.tangentImpulse = contact.tangentImpulse * ratio;
      next.rollingImpulse = contact.rollingImpulse * ratio;
    }
    next.dt = dt;
    next.active = true;
    next.bodyA = contact.bodyA;
    next.bodyB = contact.bodyB;
    contact = next;
    applyDelta(bodyA, bodyB, contact, contact.normalImpulse[0], contact.normalImpulse[1],
               contact.tangentImpulse, contact.rollingImpulse);
  }
  if (bodyA.friction > 0 && bodyB.friction > 0)
    bodyA.touching = bodyB.touching = true;
  return true;
}
}
void ContactSolver::beginStep(double duration) {
  dt = duration;
  for (auto &[source, contact] : contacts)
    contact.active = false;
}
void ContactSolver::warmStart(std::vector<Body> &bodies) {
  for (auto &[source, contact] : contacts) {
    if (contact.bodyA >= bodies.size() || contact.bodyB >= bodies.size())
      continue;
    prepareContact(bodies[contact.bodyA], bodies[contact.bodyB], contact, dt);
  }
  for (auto &[source, contact] : contacts)
    if (contact.active)
      solveVelocity(bodies[contact.bodyA], bodies[contact.bodyB], contact);
}
void ContactSolver::prepare(std::vector<Body> &bodies, size_t first, size_t second, int source) {
  auto &contact = contacts[source];
  contact.bodyA = first;
  contact.bodyB = second;
  prepareContact(bodies[first], bodies[second], contact, dt);
}
void ContactSolver::solve(std::vector<Body> &bodies, size_t first, size_t second, int source) {
  auto &contact = contacts[source];
  contact.bodyA = first;
  contact.bodyB = second;
  auto &bodyA = bodies[first];
  auto &bodyB = bodies[second];
  if (prepareContact(bodyA, bodyB, contact, dt))
    solveVelocity(bodyA, bodyB, contact);
}
void ContactSolver::finishStep(std::vector<Body> &bodies) {
  for (auto it = contacts.begin(); it != contacts.end();) {
    const auto &contact = it->second;
    if (!contact.active) {
      it = contacts.erase(it);
      continue;
    }
    recordContact(bodies[contact.bodyA], bodies[contact.bodyB], contact, it->first);
    ++it;
  }
}
void solveContact(Body &bodyA, Body &bodyB, int source) {
  ContactState contact;
  if (!prepareContact(bodyA, bodyB, contact, 1))
    return;
  solveVelocity(bodyA, bodyB, contact);
  recordContact(bodyA, bodyB, contact, source);
}
