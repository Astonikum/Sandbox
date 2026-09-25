#include "runtime.hpp"
#include "geometry.hpp"

using namespace protocol;

void Runtime::record() { history.record(tickIndex, bodies); }
int Runtime::sample(double time) {
  return history.sample(time, tickIndex, bodies.size(), output.data());
}

void Runtime::beginTick() {
  for (size_t i = 0; i < bodies.size(); ++i) {
    auto &body = bodies[i];
    beforeVelocity[i] = body.velocity;
    beforeAngularVelocity[i] = body.angularVelocity;
    body.normalImpulse = body.frictionImpulse = body.springImpulse = body.jointImpulse =
        body.ropeImpulse = body.externalImpulse = {};
    body.torqueImpulse = 0;
    body.forceSamples.clear();
  }
}
double Runtime::maximumStepDuration() {
  double maximumDt = TickDuration / 8;

  std::vector<Swept> &swept = sweptBounds;
  swept.resize(bodies.size());
  for (size_t i = 0; i < bodies.size(); ++i) {
    const auto &body = bodies[i];
    double acceleration = length(forces[i] * body.inverseMass() + Vec2{0, gravity}),
           speed = length(body.velocity) +
                   std::abs(body.angularVelocity) * std::hypot(body.width, body.height) / 2 +
                   acceleration * TickDuration,
           reach = speed * TickDuration, ex = projectedRadius(body, {1, 0}) + reach,
           ey = projectedRadius(body, {0, 1}) + reach;
    Vec2 center = contactCenter(body);
    swept[i] = {(int)i, center.x - ex, center.x + ex, center.y - ey, center.y + ey, speed};
  }
  std::sort(swept.begin(), swept.end(),
            [](const Swept &bodyA, const Swept &body) { return bodyA.x0 < body.x0; });
  for (size_t i = 0; i < swept.size(); ++i)
    for (size_t j = i + 1; j < swept.size() && swept[j].x0 <= swept[i].x1; ++j) {
      const auto &boundsA = swept[i];
      const auto &boundsB = swept[j];
      const auto &bodyA = bodies[boundsA.i];
      const auto &body = bodies[boundsB.i];
      if (boundsA.y1 < boundsB.y0 || boundsB.y1 < boundsA.y0 ||
          (bodyA.inverseMass() == 0 && body.inverseMass() == 0))
        continue;
      maximumDt =
          std::min(maximumDt, .2 * std::min({bodyA.width, bodyA.height, body.width, body.height}) /
                                  std::max(boundsA.speed + boundsB.speed, 1e-9));
    }
  for (const auto &link : links)
    if (link.kind == LinkKind::Spring) {
      const auto &bodyA = bodies[link.bodyA];
      const Body *body = link.bodyB >= 0 ? &bodies[link.bodyB] : nullptr;

      double effectiveInverseMass =
          bodyA.inverseMass() + dot(link.localAnchorA, link.localAnchorA) * bodyA.inverseInertia() +
          (body ? body->inverseMass() +
                      dot(link.localAnchorB, link.localAnchorB) * body->inverseInertia()
                : 0);
      if (effectiveInverseMass > 0) {
        if (link.stiffness > 0)
          maximumDt = std::min(maximumDt, .15 / std::sqrt(link.stiffness * effectiveInverseMass));
        if (link.damping > 0)
          maximumDt = std::min(maximumDt, .5 / (link.damping * effectiveInverseMass));
      }
    }

  return maximumDt;
}
void Runtime::applyTrajectories(double time) {
  for (size_t i = 0; i < bodies.size(); ++i)
    if (driven[i]) {
      auto positionX = paths[i][0].at(time), positionY = paths[i][1].at(time),
           angle = paths[i][2].at(time);
      bodies[i].position = {positionX.value, positionY.value};
      bodies[i].velocity = {positionX.derivative, positionY.derivative};
      bodies[i].angle = angle.value;
      bodies[i].angularVelocity = angle.derivative;
    }
}
int Runtime::advance(int draggedBody, double x, double y) {
  if (!valid || draggedBody < -1 || draggedBody >= (int)bodies.size() || !bounded(x) || !bounded(y))
    return Status::InvalidInput;
  try {
    beginTick();
    double maximumDt = maximumStepDuration();
    double requiredSubsteps = std::ceil(TickDuration / maximumDt);
    if (!std::isfinite(requiredSubsteps) || requiredSubsteps > MaxSubsteps) {
      valid = false;
      return Status::ExcessiveSubsteps;
    }
    int substeps = static_cast<int>(requiredSubsteps);
    double dt = TickDuration / substeps;
    for (int substep = 0; substep < substeps; ++substep) {
      double time = tickIndex * TickDuration + (substep + 1) * dt;
      applyTrajectories(time);
      solver.step(bodies, links, forces, gravity, dt, draggedBody, {x, y}, localGrab);
    }
    for (const auto &body : bodies)
      for (double value : {body.position.x, body.position.y, body.velocity.x, body.velocity.y,
                           body.angle, body.angularVelocity})
        if (!bounded(value)) {
          valid = false;
          return Status::InvalidState;
        }
    updateObservables();
    ++tickIndex;
    record();
    return Status::Ok;
  } catch (...) {
    valid = false;
    return Status::FormulaError;
  }
}
