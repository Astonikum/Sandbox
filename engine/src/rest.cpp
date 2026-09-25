#include "rest.hpp"

void stabilizeRest(Body &body, const RestState &before, double dt, bool dragged) {
  constexpr double speedThreshold = .001;
  constexpr double accelerationThreshold = .01;
  constexpr double quietDuration = .5;
  const double radius = std::hypot(body.width, body.height) / 2;
  const double speed = length(body.velocity) + radius * std::abs(body.angularVelocity);
  const double acceleration = (length(body.velocity - before.velocity) +
                               radius * std::abs(body.angularVelocity - before.angularVelocity)) /
                              dt;
  const double travel =
      length(body.position - before.position) + radius * std::abs(body.angle - before.angle);
  if (body.fixed || body.kinematic || dragged || !body.touching || speed > speedThreshold ||
      acceleration > accelerationThreshold || travel > speedThreshold * dt) {
    body.quietTime = 0;
    return;
  }
  body.quietTime += dt;
  if (body.quietTime < quietDuration)
    return;
  body.velocity = {};
  body.angularVelocity = 0;
}
