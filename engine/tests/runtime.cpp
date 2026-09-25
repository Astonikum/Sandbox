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

int main() {
  auto first = std::make_unique<Runtime>();
  auto second = std::make_unique<Runtime>();
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
