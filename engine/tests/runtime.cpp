#include "../src/runtime.hpp"
#include <cassert>
#include <cstring>
#include <iostream>
#include <memory>

using namespace protocol;

static void resetBody(Runtime &runtime, double velocity) {
  const double row[BodyStride] = {BodyKind::Circle, 0, 0, .2, .2, 0, 1, 0, 0,
                                  velocity,         0, 0, 0,  0,  0, 0, 0};
  std::copy(std::begin(row), std::end(row), runtime.inputData());
  assert(runtime.reset(1, 0, 0) == Status::Ok);
}

static void checkCollisionMotion(Runtime &runtime) {
  for (int kind : {BodyKind::Rectangle, BodyKind::Circle})
    for (double angle : {0., .4, 1.5707963267948966})
      for (double side : {-1., 1.}) {
        const Vec2 direction{side * std::cos(angle), side * std::sin(angle)};
        const double body[BodyStride] = {static_cast<double>(kind), 0, 0, .01, .01, angle, 1,
                                        0, 0, 0, 0, 0, 0, 0, 0, 0, 0};
        const double wall[BodyStride] = {BodyKind::Surface, .04 * direction.x, .04 * direction.y,
                                        1, .001, angle + 1.5707963267948966, 0,
                                        0, 0, 0, 0, 0, 1, 0, 0, 0, 0};
        const double spring[LinkStride] = {LinkKind::Spring, 0, -1, 5 * direction.x, 5 * direction.y,
                                          0, 0, 0, 0, 0, 2000, 0, -1, 0, 0, 0};
        std::copy(std::begin(body), std::end(body), runtime.inputData());
        std::copy(std::begin(wall), std::end(wall), runtime.inputData() + BodyStride);
        std::copy(std::begin(spring), std::end(spring), runtime.inputData() + MaxBodies * BodyStride);
        assert(runtime.reset(2, 1, 0) == Status::Ok);
        for (int tick = 0; tick < 8; ++tick) {
          assert(runtime.advance(-1, 0, 0) == Status::Ok);
          assert(runtime.sample(runtime.time()) == Status::Ok);
          const Vec2 position{runtime.outputData()[0], runtime.outputData()[1]};
          assert(dot(position, direction) <= .03502);
        }
        assert(runtime.reset(2, 0, 0) == Status::Ok);
        assert(runtime.editBody(0, BodyField::VelocityX, 50 * direction.x) == Status::Ok);
        assert(runtime.editBody(0, BodyField::VelocityY, 50 * direction.y) == Status::Ok);
        assert(runtime.advance(-1, 0, 0) == Status::Ok);
        assert(runtime.sample(runtime.time()) == Status::Ok);
        assert(dot({runtime.outputData()[0], runtime.outputData()[1]}, direction) <= .03502);
        assert(std::abs(dot({runtime.outputData()[3], runtime.outputData()[4]}, direction)) < 1e-8);
      }
  const double body[BodyStride] = {BodyKind::Circle, .02, 0, .01, .01, 0, 1,
                                  0, 0, 0, 0, 0, 0, 0, 0, 0, 0};
  const double wall[BodyStride] = {BodyKind::Surface, 0, 0, 1, .001, 1.5707963267948966, 0,
                                  0, 0, 0, 0, 0, 2, 0, 0, 0, 0};
  std::copy(std::begin(body), std::end(body), runtime.inputData());
  std::copy(std::begin(wall), std::end(wall), runtime.inputData() + BodyStride);
  assert(runtime.reset(2, 0, 0) == Status::Ok);
  std::strcpy(runtime.formulaData(), "5000*t^2");
  std::strcpy(runtime.formulaData() + FormulaSize, "0");
  std::strcpy(runtime.formulaData() + FormulaSize * 2, "pi/2");
  assert(runtime.setTrajectory(1, 1) == Status::Ok);
  assert(runtime.advance(-1, 0, 0) == Status::Ok);
  assert(runtime.sample(runtime.time()) == Status::Ok);
  assert(runtime.outputData()[0] >= runtime.outputData()[6] + .00498);
  assert(runtime.outputData()[3] > 0);
  assert(runtime.reset(2, 0, 0) == Status::Ok);
  std::strcpy(runtime.formulaData(), "500000*t^2");
  assert(runtime.setTrajectory(1, 1) == Status::Ok);
  assert(runtime.advance(-1, 0, 0) == Status::Ok);
  assert(runtime.sample(runtime.time()) == Status::Ok);
  assert(runtime.outputData()[0] >= runtime.outputData()[6] + .00498);
  assert(runtime.reset(2, 0, 0) == Status::Ok);
  std::strcpy(runtime.formulaData(), "500000000*t^2");
  assert(runtime.setTrajectory(1, 1) == Status::Ok);
  assert(runtime.advance(-1, 0, 0) == Status::ExcessiveSubsteps);
  assert(runtime.time() == 0);
  std::cout << "PASS accelerated collision: stretched springs, thin rotated surfaces, both sides, "
               "kinematic acceleration and bounded rejection\n";
}

int main() {
  auto first = std::make_unique<Runtime>();
  auto second = std::make_unique<Runtime>();
  checkCollisionMotion(*first);
  resetBody(*first, 1);
  resetBody(*second, -2);
  assert(first->inputData() != second->inputData());
  for (int i = 0; i < 600; ++i) {
    assert(first->advance(-1, 0, 0) == Status::Ok);
    if (i < 120)
      assert(second->advance(-1, 0, 0) == Status::Ok);
  }
  assert(first->time() == 2.5);
  assert(second->time() == .5);
  assert(first->sample(first->time()) == Status::Ok);
  assert(second->sample(second->time()) == Status::Ok);
  assert(std::abs(first->outputData()[0] - 2.5) < 1e-10);
  assert(std::abs(second->outputData()[0] + 1) < 1e-10);
  assert(first->sample(0) == Status::InvalidInput);
  assert(second->sample(0) == Status::Ok);
  assert(first->sample(2.499) == Status::Ok);
  assert(std::abs(first->outputData()[0] - 2.499) < 1e-10);
  assert(first->editBody(0, BodyField::Mass, -1) == Status::InvalidInput);
  resetBody(*first, 0);
  std::strcpy(first->formulaData(), "t^2");
  std::strcpy(first->formulaData() + FormulaSize, "0");
  std::strcpy(first->formulaData() + FormulaSize * 2, "sin(t)");
  assert(first->setTrajectory(0, 1) == Status::Ok);
  for (int i = 0; i < 240; ++i)
    assert(first->advance(-1, 0, 0) == Status::Ok);
  assert(first->sample(1) == Status::Ok);
  assert(std::abs(first->outputData()[0] - 1) < 1e-12);
  assert(std::abs(first->outputData()[3] - 2) < 1e-12);
  assert(second->time() == .5);
  resetBody(*first, .5);
  assert(first->time() == 0);
  assert(first->advance(-1, 0, 0) == Status::Ok);
  assert(first->sample(first->time()) == Status::Ok);
  assert(first->outputData()[3] == .5);
  std::cout
      << "PASS independent runtimes, history wrap/interpolation, reset and formula derivatives\n";
}
