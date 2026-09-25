#include "../src/core.hpp"
#include <cassert>
#include <iostream>

int main() {
  Solver solver;

  Body a{0, {0, 0}, {0, 0}, .1, .1, 0, 1, 0, 0, 0, false};
  std::vector<Body> bs{a};
  std::vector<Vec2> fs(1);
  for (int i = 0; i < 1000; ++i)
    solver.step(bs, {}, fs, 9.81, .001, -1, {});
  assert(std::abs(bs[0].velocity.y - 9.81) < 1e-8);
  assert(std::abs(bs[0].position.y - 4.905) < .006);
  bs = {a};
  fs[0] = {2, 0};
  for (int i = 0; i < 1000; ++i)
    solver.step(bs, {}, fs, 0, .001, -1, {});
  assert(std::abs(bs[0].velocity.x - 2) < 1e-8);
  bs = {a};
  bs[0].position = {.1, 0};
  fs[0] = {};
  Link rope{4, 0, -1, {0, 0}, {}, {}, .1, 0, 0};
  for (int i = 0; i < 500; ++i)
    solver.step(bs, {rope}, fs, 9.81, .001, 0, {1, 1});
  assert(length(bs[0].position) < .1001);
  bs = {a};
  bs[0].position = {.15, 0};
  Link spring{3, 0, -1, {0, 0}, {}, {}, .1, 10, 0};
  solver.step(bs, {spring}, fs, 0, .001, -1, {});
  assert(bs[0].velocity.x < 0);
  Body floor = a;
  floor.fixed = true;
  floor.position = {0, .2};
  floor.width = 2;
  floor.height = .1;
  bs = {a, floor};
  fs.resize(2);
  for (int i = 0; i < 2000; ++i)
    solver.step(bs, {}, fs, 9.81, .001, -1, {});
  assert(std::abs(bs[0].position.y - .1) < .0002);
  assert(std::abs(bs[0].velocity.y) < .001);
  bs = {a, floor};
  bs[0].position = {0, .1};
  bs[0].velocity = {1, 0};
  for (int i = 0; i < 500; ++i)
    solver.step(bs, {}, fs, 9.81, .001, -1, {});
  assert(std::abs(bs[0].velocity.x - 1) < .001);
  bs = {a, floor};
  bs[0].position = {0, .1};
  bs[0].velocity = {1, 0};
  bs[0].friction = bs[1].friction = .5;
  for (int i = 0; i < 500; ++i)
    solver.step(bs, {}, fs, 9.81, .001, -1, {});
  assert(std::abs(bs[0].velocity.x) < .02);
  bs = {a};
  fs.resize(1);
  bs[0].position = {.1, 0};
  Link pin{2, 0, -1, {0, 0}, {-.1, 0}, {}, 0, 0, 0};
  for (int i = 0; i < 500; ++i)
    solver.step(bs, {pin}, fs, 9.81, .001, -1, {});
  assert(length(bs[0].position + rotated({-.1, 0}, bs[0].angle)) < .0001);
  assert(std::abs(bs[0].angle) > .1);
  bs = {a, a};
  fs.resize(2);
  bs[0].position = {-.1, .2};
  bs[1].position = {.1, .2};
  bs[1].mass = 2;
  Link pulley{10, 0, 1, {0, 0}, {}, {}, 2 * std::hypot(.1, .2), 0, 0};
  for (int i = 0; i < 300; ++i)
    solver.step(bs, {pulley}, fs, 9.81, .001, -1, {});
  assert(length(bs[0].position) + length(bs[1].position) < pulley.length + .0001);
  assert(bs[1].position.y > bs[0].position.y);
  std::cout << "PASS: free fall, force, rope drag, Hooke, resting solveContact, zero "
               "friction, Coulomb friction, rotating pin, ideal pulley\n";
}
