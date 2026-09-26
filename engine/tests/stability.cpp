#include "../src/runtime.hpp"
#include <array>
#include <cassert>
#include <iostream>
#include <memory>

using namespace protocol;
using Row = std::array<double, BodyStride>;

static void load(Runtime &runtime, const std::vector<Row> &rows, double gravity = 9.81) {
  for (size_t i = 0; i < rows.size(); ++i)
    std::copy(rows[i].begin(), rows[i].end(), runtime.inputData() + i * BodyStride);
  assert(runtime.reset(static_cast<int>(rows.size()), 0, gravity) == Status::Ok);
}
static void advance(Runtime &runtime, int ticks) {
  for (int i = 0; i < ticks; ++i)
    assert(runtime.advance(-1, 0, 0) == Status::Ok);
  assert(runtime.sample(runtime.time()) == Status::Ok);
}

int main() {
  auto runtime = std::make_unique<Runtime>();
  std::vector<Row> stack;
  for (int i = 0; i < 10; ++i)
    stack.push_back(
        {BodyKind::Rectangle, 0, -.05 - .1 * i, .1, .1, 0, 1, .5, 0, 0, 0, 0, 0, 0, 0, 0, 0});
  stack.push_back({BodyKind::Surface, 0, .05, 4, .1, 0, 1, .5, 0, 0, 0, 0, 1, 0, 0, 0, 0});
  load(*runtime, stack);
  advance(*runtime, 720);
  std::array<double, 60> resting;
  std::copy(runtime->outputData(), runtime->outputData() + 60, resting.begin());
  for (int tick = 0; tick < 240; ++tick) {
    advance(*runtime, 1);
    for (int body = 0; body < 10; ++body) {
      const double *state = runtime->outputData() + StateStride * body;
      const double *derived = runtime->observableData() + ObservableStride * body;
      assert(std::hypot(state[3], state[4]) < 1e-9 && std::abs(state[5]) < 1e-9);
      assert(std::abs(state[1] - resting[body * StateStride + 1]) < 1e-8);
      assert(std::hypot(derived[0], derived[1]) < 1e-7);
      assert(std::abs(derived[5] + 9.81) < 1e-7);
    }
  }
  assert(runtime->relax() < 1e-6);
  assert(runtime->editBody(9, BodyField::VelocityX, .3) == Status::Ok);
  advance(*runtime, 1);
  assert(runtime->outputData()[9 * StateStride + 3] > .2);
  assert(runtime->editBody(10, BodyField::Y, 2) == Status::Ok);
  advance(*runtime, 24);
  assert(runtime->outputData()[4] > .9);
  std::cout << "PASS contact stack: exact rest, balanced reactions, impulse and removed support\n";

  for (const auto [angle, friction, initialSpeed] : {std::array<double, 3>{0, 0, .6},
                                                     {.4, 0, .6},
                                                     {-.4, 0, -.6},
                                                     {std::atan(.3), .3, .6},
                                                     {.4, .3, .6},
                                                     {-.4, .3, -.6},
                                                     {.2, .5, 0}}) {
    const Vec2 normal{-std::sin(angle), std::cos(angle)};
    const Vec2 tangent{std::cos(angle), std::sin(angle)};
    Row box{BodyKind::Rectangle,
            -.2 * normal.x,
            -.2 * normal.y,
            .4,
            .4,
            angle,
            1,
            friction,
            0,
            initialSpeed * tangent.x,
            initialSpeed * tangent.y,
            0,
            0,
            0,
            0,
            0,
            0};
    Row floor{BodyKind::Surface,
              .075 * normal.x,
              .075 * normal.y,
              100,
              .15,
              angle,
              1,
              friction,
              0,
              0,
              0,
              0,
              1,
              0,
              0,
              0,
              0};
    load(*runtime, {box, floor});
    const double expectedAcceleration = std::copysign(
        std::max(0., 9.81 * (std::abs(std::sin(angle)) - friction * std::cos(angle))), angle);
    advance(*runtime, 120);
    Vec2 previousPoint{};
    for (int tick = 0; tick < 480; ++tick) {
      advance(*runtime, 1);
      const double *derived = runtime->observableData();
      const double *state = runtime->outputData();
      assert(std::abs(dot({derived[0], derived[1]}, tangent) - expectedAcceleration) < 1e-7);
      assert(std::abs(dot({derived[0], derived[1]}, normal)) < 1e-7);
      assert(std::abs(std::hypot(derived[4], derived[5]) - 9.81 * std::cos(angle)) < 1e-7);
      assert(std::abs(state[5]) < 1e-8);
      assert(std::abs(dot({state[3], state[4]}, tangent) - initialSpeed -
                      expectedAcceleration * runtime->time()) < 1e-7);
      const int count = runtime->collectForceSamples();
      const double *samples = runtime->forceData();
      bool foundNormal = false;
      for (int i = 0; i < count; ++i) {
        const double *sample = samples + i * ForceStride;
        if (sample[0] != 0)
          continue;
        if (friction == 0)
          assert(sample[1] != ForceCategory::Friction);
        if (sample[1] != ForceCategory::Normal)
          continue;
        Vec2 point{sample[2], sample[3]};
        if (tick > 0)
          assert(length(point - previousPoint) < 1e-7);
        previousPoint = point;
        foundNormal = true;
      }
      assert(foundNormal);
    }
  }
  std::cout << "PASS rectangle slopes: uniform/frictionless sliding, rest, stable forces and "
               "application points\n";

  for (double angle : {.28, -.4}) {
    Vec2 normal{-std::sin(angle), std::cos(angle)};
    Row box{BodyKind::Rectangle,
            -.8 * normal.x,
            -.8 * normal.y,
            .4,
            .4,
            0,
            1,
            .5,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0};
    Row floor{BodyKind::Surface,
              .075 * normal.x,
              .075 * normal.y,
              20,
              .15,
              angle,
              1,
              .5,
              0,
              0,
              0,
              0,
              1,
              0,
              0,
              0,
              0};
    load(*runtime, {box, floor});
    advance(*runtime, 1440);
    Vec2 position{runtime->outputData()[0], runtime->outputData()[1]};
    for (int tick = 0; tick < 240; ++tick) {
      advance(*runtime, 1);
      const double *state = runtime->outputData();
      assert(length(Vec2{state[0], state[1]} - position) < 1e-10);
      assert(state[3] == 0 && state[4] == 0 && state[5] == 0);
    }
    assert(runtime->relax() < 1e-7);
  }
  std::cout << "PASS dropped rectangles settle on slopes without creeping\n";

  Row free{BodyKind::Rectangle, 0, 0, .1, .1, 0, 1, 0, 0, 0, 0, 0, 0, 1e-10, 0, 0, 0};
  load(*runtime, {free}, 0);
  advance(*runtime, 240);
  assert(std::abs(runtime->observableData()[0] - 1e-10) < 1e-20);
  assert(std::abs(runtime->outputData()[3] - 1e-10) < 1e-20);
  std::cout << "PASS numerical cleanup preserves real small acceleration\n";
}
