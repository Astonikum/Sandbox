#pragma once
#include <cmath>

namespace protocol {
constexpr int MaxBodies = 200;
constexpr int MaxLinks = 400;
constexpr int BodyStride = 17;
constexpr int LinkStride = 16;
constexpr int StateStride = 6;
constexpr int ObservableStride = 20;
constexpr int ForceStride = 7;
constexpr int FormulaSize = 256;
constexpr int HistorySize = 512;
constexpr double TickDuration = 1. / 240.;
constexpr int MaxSubsteps = 256;
namespace BodyField {
enum : int {
  Kind,
  X,
  Y,
  Width,
  Height,
  Angle,
  Mass,
  Friction,
  Restitution,
  VelocityX,
  VelocityY,
  AngularVelocity,
  Motion,
  ForceX,
  ForceY,
  AccelerationX,
  AccelerationY
};
}
namespace LinkField {
enum : int {
  Kind,
  BodyA,
  BodyB,
  AnchorX,
  AnchorY,
  LocalAX,
  LocalAY,
  LocalBX,
  LocalBY,
  Length,
  Stiffness,
  Damping,
  Pulley,
  ReferenceAngle
};
}
namespace Status {
constexpr int Ok = 0, InvalidInput = 1, FormulaError = 2, ExcessiveSubsteps = 3, InvalidState = 4;
}
inline bool bounded(double value) { return std::isfinite(value) && std::abs(value) < 1e8; }
}
