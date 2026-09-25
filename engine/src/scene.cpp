#include "runtime.hpp"

using namespace protocol;

namespace {
bool decodeBody(const double *row, Body &body, Vec2 &force) {
  for (int j = 0; j < BodyStride; ++j)
    if (!bounded(row[j]))
      return false;
  if (row[BodyField::Width] < .001 || row[BodyField::Height] < .001 || row[BodyField::Mass] < 0 ||
      (row[BodyField::Mass] == 0 && row[BodyField::Motion] == 0) || row[BodyField::Friction] < 0 ||
      row[BodyField::Restitution] < 0 || row[BodyField::Restitution] > 1 ||
      row[BodyField::Motion] < 0 || row[BodyField::Motion] > 3 ||
      std::floor(row[BodyField::Motion]) != row[BodyField::Motion])
    return false;
  body = {(int)row[BodyField::Kind],
          {row[BodyField::X], row[BodyField::Y]},
          {row[BodyField::VelocityX], row[BodyField::VelocityY]},
          row[BodyField::Width],
          row[BodyField::Height],
          row[BodyField::Angle],
          row[BodyField::Mass],
          row[BodyField::Friction],
          row[BodyField::Restitution],
          row[BodyField::AngularVelocity],
          row[BodyField::Motion] == 1 || row[BodyField::Motion] == 3,
          row[BodyField::Motion] >= 2};
  if (body.fixed && !body.kinematic) {
    body.velocity = {};
    if (body.kind != BodyKind::Pulley)
      body.angularVelocity = 0;
  }
  force = {row[BodyField::ForceX] + row[BodyField::AccelerationX] * row[BodyField::Mass],
           row[BodyField::ForceY] + row[BodyField::AccelerationY] * row[BodyField::Mass]};
  return true;
}
bool decodeLink(const double *row, int count, Link &link) {
  for (int j = 0; j < LinkStride; ++j)
    if (!bounded(row[j]))
      return false;
  if (row[LinkField::BodyA] < 0 || row[LinkField::BodyA] >= count || row[LinkField::BodyB] < -1 ||
      row[LinkField::BodyB] >= count || row[LinkField::Length] < 0 ||
      row[LinkField::Stiffness] < 0 || row[LinkField::Damping] < 0 || row[LinkField::Pulley] < -1 ||
      row[LinkField::Pulley] >= count)
    return false;
  link = {(int)row[LinkField::Kind],
          (int)row[LinkField::BodyA],
          (int)row[LinkField::BodyB],
          {row[LinkField::AnchorX], row[LinkField::AnchorY]},
          {row[LinkField::LocalAX], row[LinkField::LocalAY]},
          {row[LinkField::LocalBX], row[LinkField::LocalBY]},
          row[LinkField::Length],
          row[LinkField::Stiffness],
          row[LinkField::Damping],
          (int)row[LinkField::Pulley],
          row[LinkField::ReferenceAngle]};
  return true;
}
}

int Runtime::reset(int count, int linkCount, double gravityValue) {
  if (count < 1 || count > MaxBodies || linkCount < 0 || linkCount > MaxLinks ||
      !bounded(gravityValue) || std::abs(gravityValue) > 100)
    return Status::InvalidInput;
  solver.reset();
  bodies.resize(count);
  forces.resize(count);
  links.resize(linkCount);
  driven.fill(false);
  gravityVectors.fill({});
  std::fill(std::begin(observables), std::end(observables), 0);
  gravity = gravityValue;
  tickIndex = 0;
  valid = true;
  localGrab = {};
  for (int i = 0; i < count; ++i)
    if (!decodeBody(input.data() + i * BodyStride, bodies[i], forces[i]))
      return Status::InvalidInput;
  for (int i = 0; i < linkCount; ++i)
    if (!decodeLink(input.data() + MaxBodies * BodyStride + i * LinkStride, count, links[i]))
      return Status::InvalidInput;
  record();
  return Status::Ok;
}

int Runtime::editBody(int i, int field, double value) {
  if (i < 0 || i >= (int)bodies.size() || !bounded(value))
    return Status::InvalidInput;
  auto &body = bodies[i];
  switch (field) {
  case BodyField::X:
    body.position.x = value;
    break;
  case BodyField::Y:
    body.position.y = value;
    break;
  case BodyField::Width:
    if (value < .001)
      return Status::InvalidInput;
    body.width = value;
    break;
  case BodyField::Height:
    if (value < .001)
      return Status::InvalidInput;
    body.height = value;
    break;
  case BodyField::Angle:
    body.angle = value;
    break;
  case BodyField::Mass:
    if (value < 0 || (value == 0 && !body.fixed && !body.kinematic))
      return Status::InvalidInput;
    body.mass = value;
    break;
  case BodyField::Friction:
    if (value < 0)
      return Status::InvalidInput;
    body.friction = value;
    break;
  case BodyField::Restitution:
    if (value < 0 || value > 1)
      return Status::InvalidInput;
    body.restitution = value;
    break;
  case BodyField::VelocityX:
    if (body.fixed && !body.kinematic)
      return Status::InvalidInput;
    body.velocity.x = value;
    break;
  case BodyField::VelocityY:
    if (body.fixed && !body.kinematic)
      return Status::InvalidInput;
    body.velocity.y = value;
    break;
  case BodyField::AngularVelocity:
    if (body.fixed && !body.kinematic && body.kind != BodyKind::Pulley)
      return Status::InvalidInput;
    body.angularVelocity = value;
    break;
  default:
    return Status::InvalidInput;
  }
  record();
  return Status::Ok;
}

int Runtime::setGravityVector(int i, double x, double y) {
  if (i < 0 || i >= (int)bodies.size() || !bounded(x) || !bounded(y))
    return Status::InvalidInput;
  gravityVectors[i] = {x, y};
  return Status::Ok;
}

int Runtime::setForce(int i, double fx, double fy, double ax, double ay) {
  if (i < 0 || i >= (int)bodies.size() || !bounded(fx) || !bounded(fy) || !bounded(ax) ||
      !bounded(ay))
    return Status::InvalidInput;
  forces[i] = {fx + ax * bodies[i].mass, fy + ay * bodies[i].mass};
  return Status::Ok;
}

int Runtime::setGravity(double gravityValue) {
  if (!bounded(gravityValue) || std::abs(gravityValue) > 100)
    return Status::InvalidInput;
  gravity = gravityValue;
  return Status::Ok;
}

int Runtime::setDragPoint(double x, double y) {
  if (!bounded(x) || !bounded(y))
    return Status::InvalidInput;
  localGrab = {x, y};
  return Status::Ok;
}

int Runtime::editLink(int i, double length, double stiffness, double damping) {
  if (i < 0 || i >= (int)links.size() || !bounded(length) || length < 0 || !bounded(stiffness) ||
      stiffness < 0 || !bounded(damping) || damping < 0)
    return Status::InvalidInput;
  links[i].length = length;
  links[i].stiffness = stiffness;
  links[i].damping = damping;
  return Status::Ok;
}

int Runtime::setTrajectory(int i, int enabled) {
  if (i < 0 || i >= (int)bodies.size())
    return Status::InvalidInput;
  if (!enabled && bodies[i].mass == 0 && !bodies[i].fixed)
    return Status::InvalidInput;
  try {
    if (enabled) {
      std::array<Expression, 3> parsed;
      for (int j = 0; j < 3; ++j) {
        formulas[j * FormulaSize + FormulaSize - 1] = 0;
        parsed[j].compile(formulas.data() + j * FormulaSize);
        parsed[j].at(tickIndex * TickDuration);
      }
      paths[i] = std::move(parsed);
    }
  } catch (...) {
    return Status::FormulaError;
  }
  driven[i] = enabled;
  bodies[i].kinematic = enabled;
  if (enabled) {
    auto x = paths[i][0].at(tickIndex * TickDuration), y = paths[i][1].at(tickIndex * TickDuration),
         a = paths[i][2].at(tickIndex * TickDuration);
    bodies[i].position = {x.value, y.value};
    bodies[i].velocity = {x.derivative, y.derivative};
    bodies[i].angle = a.value;
    bodies[i].angularVelocity = a.derivative;
  } else if (bodies[i].fixed) {
    bodies[i].velocity = {};
    bodies[i].angularVelocity = 0;
  }
  record();
  return Status::Ok;
}
