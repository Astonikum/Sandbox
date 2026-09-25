#include "solver.hpp"
#include "collision.hpp"
#include "constraints.hpp"

namespace {
void integrateForces(std::vector<Body> &bodies, const std::vector<Vec2> &forces, double gravity,
                     double dt, int draggedBody, Vec2 target, Vec2 localGrab) {
  for (size_t i = 0; i < bodies.size(); ++i) {
    auto &body = bodies[i];
    if (body.fixed || body.kinematic)
      continue;
    Vec2 force = forces[i] + Vec2{0, gravity * body.mass};
    if ((int)i == draggedBody) {
      Vec2 offset = rotated(localGrab, body.angle);
      Vec2 pull = (target - body.position - offset) * (body.mass * 150) -
                  pointVelocity(body, offset) * (body.mass * 20);
      double limit = body.mass * 50;
      if (length(pull) > limit)
        pull = normalized(pull) * limit;
      force = force + pull;
      body.angularVelocity += cross(offset, pull * dt) * body.inverseInertia();
      body.torqueImpulse += cross(offset, pull * dt);
    }
    body.velocity = body.velocity + force * (dt / body.mass);
    body.externalImpulse = body.externalImpulse + force * dt;
  }
}
void applySprings(std::vector<Body> &bodies, const std::vector<Link> &links, double dt) {
  for (auto &link : links)
    if (link.kind == LinkKind::Spring && link.bodyA >= 0) {
      const int source = static_cast<int>(&link - links.data());
      auto &a = bodies[link.bodyA];
      Body *body = link.bodyB >= 0 ? &bodies[link.bodyB] : nullptr;
      Vec2 offsetA = rotated(link.localAnchorA, a.angle),
           offsetB = body ? rotated(link.localAnchorB, body->angle) : Vec2{},
           separation = (body ? body->position + offsetB : link.anchor) - (a.position + offsetA),
           direction = normalized(separation);
      double relative = dot(
          (body ? pointVelocity(*body, offsetB) : Vec2{}) - pointVelocity(a, offsetA), direction);
      Vec2 impulse =
          direction *
          ((link.stiffness * (length(separation) - link.length) + link.damping * relative) * dt);
      applyImpulse(a, impulse, offsetA, ForceCategory::Spring, source);
      if (body)
        applyImpulse(*body, impulse * (-1), offsetB, ForceCategory::Spring, source);
    }
}
void integratePositions(std::vector<Body> &bodies, double dt) {
  for (auto &body : bodies) {
    if (!body.fixed && !body.kinematic)
      body.position = body.position + body.velocity * dt;
    if (body.inverseInertia() > 0)
      body.angle += body.angularVelocity * dt;
  }
}
}
void Solver::step(std::vector<Body> &bodies, const std::vector<Link> &links,
                  const std::vector<Vec2> &forces, double gravity, double dt, int draggedBody,
                  Vec2 target, Vec2 localGrab) {
  previous.clear();
  previous.reserve(bodies.size());
  for (auto &body : bodies) {
    previous.push_back({body.position, body.velocity, body.angle, body.angularVelocity});
    body.touching = false;
  }
  integrateForces(bodies, forces, gravity, dt, draggedBody, target, localGrab);
  applySprings(bodies, links, dt);
  integratePositions(bodies, dt);
  broadPhase.prepare(bodies, links);
  contacts.beginStep(dt);
  constexpr int iterations = 24;
  constexpr int broadPhaseInterval = 4;
  for (int iteration = 0; iteration < iterations; ++iteration) {
    for (size_t i = 0; i < links.size(); ++i)
      if (links[i].kind != LinkKind::Spring)
        solveConstraint(bodies, links[i], static_cast<int>(i));
    if (iteration % broadPhaseInterval == 0)
      broadPhase.update(bodies);
    for (auto [first, second] : broadPhase.candidates()) {
      const int source = -1 - static_cast<int>(first * bodies.size() + second);
      contacts.solve(bodies, first, second, source);
    }
  }
  contacts.finishStep(bodies);
  for (size_t i = 0; i < bodies.size(); ++i)
    stabilizeRest(bodies[i], previous[i], dt, static_cast<int>(i) == draggedBody);
}
