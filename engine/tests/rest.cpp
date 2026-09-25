#include "../src/core.hpp"
#include <cassert>
#include <iostream>

int main() {
  Solver solver;
  for (double dt : {.001, .0005}) {
    for (int kind : {0, 1}) {
      Body moving{kind, {0, -1}, {.2, 0}, .4, .4, .2, 1, .5, 0, 1, false};
      Body floor{0, {0, .1}, {}, 100, .2, 0, 0, .5, 0, 0, true};
      std::vector<Body> bodies{moving, floor};
      std::vector<Vec2> forces(2);
      auto advance = [&](double seconds, int drag = -1) {
        for (int i = 0; i < int(seconds / dt); ++i)
          solver.step(bodies, {}, forces, 9.81, dt, drag, {1, -1});
      };
      advance(12);
      assert(length(bodies[0].velocity) == 0);
      assert(bodies[0].angularVelocity == 0);
      const Vec2 resting = bodies[0].position;
      const double angle = bodies[0].angle;
      advance(2);
      assert(length(bodies[0].position - resting) < 1e-8);
      assert(std::abs(bodies[0].angle - angle) < 1e-8);
      const auto settled = bodies;
      bodies[0].velocity = {.5, 0};
      advance(.1);
      assert(length(bodies[0].position - resting) > .01);
      bodies = settled;
      advance(.1, 0);
      assert(length(bodies[0].velocity) > .01);
      bodies = settled;
      forces[0] = {10, 0};
      advance(.1);
      assert(bodies[0].velocity.x > .1);
      bodies = settled;
      forces[0] = {};
      bodies[1].position.y = 10;
      advance(.1);
      assert(bodies[0].velocity.y > .9);
      bodies = settled;
      bodies[1].kinematic = true;
      bodies[1].velocity = {.5, 0};
      advance(.1);
      assert(bodies[0].velocity.x > .1);
    }
  }
  Body free{1, {}, {.0001, 0}, .4, .4, 0, 1, 0, 0, .0001, false};
  std::vector<Body> bodies{free};
  std::vector<Vec2> forces(1);
  for (int i = 0; i < 2000; ++i)
    solver.step(bodies, {}, forces, 0, .001, -1, {});
  assert(bodies[0].velocity.x == free.velocity.x &&
         bodies[0].angularVelocity == free.angularVelocity);
  assert(std::abs(bodies[0].position.x - .0002) < 1e-12);
  std::cout << "PASS rest: falling box, rolling circle, persistent rest, applyImpulse, "
               "drag, force, removed/moving support, slow free motion\n";
}
