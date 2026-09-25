#include "history.hpp"

using namespace protocol;

void StateHistory::record(int tickIndex, const std::vector<Body> &bodies) {
  double *frame = frames[tickIndex % HistorySize].data();
  for (size_t i = 0; i < bodies.size(); ++i) {
    const auto &body = bodies[i];
    frame[i * StateStride] = body.position.x;
    frame[i * StateStride + 1] = body.position.y;
    frame[i * StateStride + 2] = body.angle;
    frame[i * StateStride + 3] = body.velocity.x;
    frame[i * StateStride + 4] = body.velocity.y;
    frame[i * StateStride + 5] = body.angularVelocity;
  }
}
int StateHistory::sample(double time, int tickIndex, size_t bodyCount, double *output) const {
  if (!std::isfinite(time) || time < 0 || time > tickIndex * TickDuration + 1e-10 ||
      time < std::max(0, tickIndex - HistorySize + 1) * TickDuration)
    return Status::InvalidInput;
  double frame = time / TickDuration;
  int startIndex = std::min(tickIndex, (int)std::floor(frame + 1e-10)),
      endIndex = std::min(tickIndex, startIndex + 1);
  double fraction = std::clamp(frame - startIndex, 0., 1.);
  const double *before = frames[startIndex % HistorySize].data();
  const double *after = frames[endIndex % HistorySize].data();
  for (size_t bodyIndex = 0; bodyIndex < bodyCount; ++bodyIndex)
    for (int coordinate = 0; coordinate < 3; ++coordinate) {
      int offset = bodyIndex * StateStride + coordinate;
      double delta = after[offset] - before[offset],
             expectedTravel = (before[offset + 3] + after[offset + 3]) * .5 * TickDuration;
      bool smooth = std::abs(delta - expectedTravel) < .05 * std::max(std::abs(delta), 1e-6);
      output[offset] =
          smooth ? (2 * fraction * fraction * fraction - 3 * fraction * fraction + 1) *
                           before[offset] +
                       (fraction * fraction * fraction - 2 * fraction * fraction + fraction) *
                           TickDuration * before[offset + 3] +
                       (-2 * fraction * fraction * fraction + 3 * fraction * fraction) *
                           after[offset] +
                       (fraction * fraction * fraction - fraction * fraction) * TickDuration *
                           after[offset + 3]
                 : before[offset] + delta * fraction;
      output[offset + 3] = before[offset + 3] + (after[offset + 3] - before[offset + 3]) * fraction;
    }
  return Status::Ok;
}
