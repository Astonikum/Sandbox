#include "runtime.hpp"

using namespace protocol;

void Runtime::updateObservables() {
  for (size_t i = 0; i < bodies.size(); ++i) {
    const auto &body = bodies[i];
    Vec2 acceleration = (body.velocity - beforeVelocity[i]) * (1 / TickDuration),
         gravityForce = (gravityVectors[i] + Vec2{0, gravity}) * body.mass,
         normalForce = body.normalImpulse * (1 / TickDuration),
         frictionForce = body.frictionImpulse * (1 / TickDuration),
         springForce = body.springImpulse * (1 / TickDuration),
         jointForce = body.jointImpulse * (1 / TickDuration),
         ropeForce = body.ropeImpulse * (1 / TickDuration), netForce = acceleration * body.mass,
         weight = (normalForce + frictionForce + springForce + jointForce + ropeForce) * (-1);
    double values[] = {acceleration.x,
                       acceleration.y,
                       gravityForce.x,
                       gravityForce.y,
                       normalForce.x,
                       normalForce.y,
                       frictionForce.x,
                       frictionForce.y,
                       springForce.x,
                       springForce.y,
                       jointForce.x,
                       jointForce.y,
                       ropeForce.x,
                       ropeForce.y,
                       netForce.x,
                       netForce.y,
                       weight.x,
                       weight.y,
                       body.torqueImpulse / TickDuration,
                       (body.angularVelocity - beforeAngularVelocity[i]) / TickDuration};
    std::copy(values, values + ObservableStride, observables.data() + i * ObservableStride);
  }
}
double Runtime::relax() {
  double residual = 0;
  for (size_t i = 0; i < bodies.size(); ++i) {
    auto &body = bodies[i];
    if (body.inverseMass() == 0 && body.inverseInertia() == 0)
      continue;
    double *derived = observables.data() + i * ObservableStride;
    residual = std::max({residual, length(body.velocity), std::abs(body.angularVelocity),
                         std::hypot(derived[0], derived[1]), std::abs(derived[19])});
    body.velocity = body.velocity * .9;
    body.angularVelocity *= .9;
  }
  return residual;
}

int Runtime::collectForceSamples() {
  forceOutput.clear();
  for (size_t i = 0; i < bodies.size(); ++i)
    for (const auto &sample : bodies[i].forceSamples) {
      forceOutput.insert(forceOutput.end(),
                         {static_cast<double>(i), static_cast<double>(sample.category),
                          sample.localPoint.x, sample.localPoint.y, sample.impulse.x / TickDuration,
                          sample.impulse.y / TickDuration,
                          static_cast<double>(sample.source * 3 + sample.slot)});
    }
  return static_cast<int>(forceOutput.size() / ForceStride);
}
