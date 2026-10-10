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
  double tolerance = .001;
  for (const auto &body : bodies)
    if (body.kind != BodyKind::Surface && body.kind != BodyKind::Rod)
      tolerance = std::min(tolerance, .01 * std::min(body.width, body.height));
  for (size_t i = 0; i < bodies.size(); ++i)
    if (driven[i])
      for (double fraction : {0., .5, 1.}) {
        const double time = (tickIndex + fraction) * TickDuration;
        const auto x = paths[i][0].at(time), y = paths[i][1].at(time), angle = paths[i][2].at(time);
        const double radius = bodies[i].round() ? 0 : std::hypot(bodies[i].width, bodies[i].height) / 2;
        const double acceleration = std::hypot(x.secondDerivative, y.secondDerivative) +
                                    std::abs(angle.secondDerivative) * radius;
        if (acceleration > 0)
          maximumDt = std::min(maximumDt, std::sqrt(8 * tolerance / acceleration));
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
    const bool hasTrajectories = std::any_of(driven.begin(), driven.end(), [](bool value) { return value; });
    if (hasTrajectories)
      trajectoryStart.resize(bodies.size());
    for (int substep = 0; substep < substeps; ++substep) {
      if (hasTrajectories)
        for (size_t i = 0; i < bodies.size(); ++i) {
          const auto &body = bodies[i];
          trajectoryStart[i] = {body.position, body.velocity, body.angle, body.angularVelocity};
        }
      double time = tickIndex * TickDuration + (substep + 1) * dt;
      applyTrajectories(time);
      if (!solver.step(bodies, links, forces, gravity, dt, draggedBody, {x, y}, localGrab,
                       hasTrajectories ? &trajectoryStart : nullptr)) {
        valid = false;
        return Status::ExcessiveSubsteps;
      }
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
