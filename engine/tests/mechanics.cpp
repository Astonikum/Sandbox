#include "../src/core.hpp"
#include <cassert>
#include <iostream>
#include <random>

static void checkBroadPhaseCache() {
  Body body{BodyKind::Rectangle, {}, {}, .1, .1, 0, 1, .5, 0, 0, false};
  std::vector<Body> bodies(4, body);
  std::vector<Link> links;
  BroadPhase reused;
  auto check = [&](size_t count) {
    BroadPhase fresh;
    fresh.prepare(bodies, links);
    reused.prepare(bodies, links);
    const auto expected = fresh.update(bodies);
    assert(expected.size() == count);
    assert(reused.update(bodies) == expected);
    reused.prepare(bodies, links);
    assert(reused.update(bodies) == expected);
  };
  check(6);
  links = {{LinkKind::Weld, 0, 1, {}, {}, {}, 0, 0, 0},
           {LinkKind::Weld, 1, 2, {}, {}, {}, 0, 0, 0}};
  check(3);
  links[1].kind = LinkKind::Hinge;
  check(4);
  links[1].bodyA = 0;
  links[1].bodyB = 3;
  check(4);
  links.clear();
  bodies[0].kind = BodyKind::Rod;
  check(3);
  bodies[0].kind = BodyKind::Rectangle;
  bodies[0].fixed = bodies[1].fixed = true;
  check(5);
  bodies[0].fixed = bodies[1].fixed = false;
  bodies[0].position.x = 1;
  check(3);
  bodies[0].width = 2;
  check(6);
  bodies[0].angle = 1.5707963267948966;
  check(3);
  bodies.resize(2);
  check(0);
  bodies.clear();
  check(0);
  bodies.assign(4, body);
  check(6);
  for (double angle : {0., .4, -.7, 3.}) {
    bodies[0].angle = angle;
    const Vec2 local{.2, -.3};
    const auto expected = rotated(local, angle), actual = bodies[0].rotate(local);
    assert(actual.x == expected.x && actual.y == expected.y);
  }
  std::mt19937 random(713);
  std::uniform_real_distribution<double> value(-2, 2);
  bodies.assign(80, body);
  links.clear();
  for (int frame = 0; frame < 40; ++frame) {
    for (size_t i = 0; i < bodies.size(); ++i) {
      auto &current = bodies[i];
      current.position = {value(random), value(random) * (frame % 2 ? 20 : 1)};
      current.width = .1 + std::abs(value(random));
      current.height = .1 + std::abs(value(random));
      current.angle = value(random);
      current.kind = i % 11 == 0 ? BodyKind::Rod : i % 3 == 0 ? BodyKind::Circle : BodyKind::Rectangle;
      current.fixed = i % 7 == 0;
      current.kinematic = i % 13 == 0;
    }
    std::vector<std::pair<size_t, size_t>> expected;
    for (size_t i = 0; i < bodies.size(); ++i)
      for (size_t j = i + 1; j < bodies.size(); ++j) {
        const auto &a = bodies[i], &b = bodies[j];
        if (a.kind == BodyKind::Rod || b.kind == BodyKind::Rod ||
            (a.inverseMass() == 0 && b.inverseMass() == 0))
          continue;
        const Vec2 ca = contactCenter(a), cb = contactCenter(b);
        const double ax = projectedRadius(a, {1, 0}) + .0001,
                     ay = projectedRadius(a, {0, 1}) + .0001,
                     bx = projectedRadius(b, {1, 0}) + .0001,
                     by = projectedRadius(b, {0, 1}) + .0001;
        if (ca.x - ax <= cb.x + bx && cb.x - bx <= ca.x + ax &&
            ca.y - ay <= cb.y + by && cb.y - by <= ca.y + ay)
          expected.emplace_back(i, j);
      }
    reused.prepare(bodies, links);
    assert(reused.update(bodies) == expected);
    assert(reused.update(bodies) == expected);
  }
  std::cout << "PASS broadphase cache: topology, geometry, motion, rods and scene replacement\n";
}

int main() {
  checkBroadPhaseCache();
  Solver solver;

  Body a{0, {0, 0}, {0, 0}, .1, .1, 0, 1, 0, 0, 0, false};
  std::vector<Body> bs{a};
  std::vector<Vec2> fs(1);
  for (int i = 0; i < 1000; ++i)
    assert(solver.step(bs, {}, fs, 9.81, .001, -1, {}));
  assert(std::abs(bs[0].velocity.y - 9.81) < 1e-8);
  assert(std::abs(bs[0].position.y - 4.905) < .006);
  bs = {a};
  fs[0] = {2, 0};
  for (int i = 0; i < 1000; ++i)
    assert(solver.step(bs, {}, fs, 0, .001, -1, {}));
  assert(std::abs(bs[0].velocity.x - 2) < 1e-8);
  bs = {a};
  bs[0].position = {.1, 0};
  fs[0] = {};
  Link rope{4, 0, -1, {0, 0}, {}, {}, .1, 0, 0};
  for (int i = 0; i < 500; ++i)
    assert(solver.step(bs, {rope}, fs, 9.81, .001, 0, {1, 1}));
  assert(length(bs[0].position) < .1001);
  bs = {a};
  bs[0].position = {.15, 0};
  Link spring{3, 0, -1, {0, 0}, {}, {}, .1, 10, 0};
  assert(solver.step(bs, {spring}, fs, 0, .001, -1, {}));
  assert(bs[0].velocity.x < 0);
  Body floor = a;
  floor.fixed = true;
  floor.position = {0, .2};
  floor.width = 2;
  floor.height = .1;
  bs = {a, floor};
  fs.resize(2);
  for (int i = 0; i < 2000; ++i)
    assert(solver.step(bs, {}, fs, 9.81, .001, -1, {}));
  assert(std::abs(bs[0].position.y - .1) < .0002);
  assert(std::abs(bs[0].velocity.y) < .001);
  bs = {a, floor};
  bs[0].position = {0, .1};
  bs[0].velocity = {1, 0};
  for (int i = 0; i < 500; ++i)
    assert(solver.step(bs, {}, fs, 9.81, .001, -1, {}));
  assert(std::abs(bs[0].velocity.x - 1) < .001);
  bs = {a, floor};
  bs[0].position = {0, .1};
  bs[0].velocity = {1, 0};
  bs[0].friction = bs[1].friction = .5;
  for (int i = 0; i < 500; ++i)
    assert(solver.step(bs, {}, fs, 9.81, .001, -1, {}));
  assert(std::abs(bs[0].velocity.x) < .02);
  bs = {a};
  fs.resize(1);
  bs[0].position = {.1, 0};
  Link pin{2, 0, -1, {0, 0}, {-.1, 0}, {}, 0, 0, 0};
  for (int i = 0; i < 500; ++i)
    assert(solver.step(bs, {pin}, fs, 9.81, .001, -1, {}));
  assert(length(bs[0].position + rotated({-.1, 0}, bs[0].angle)) < .0001);
  assert(std::abs(bs[0].angle) > .1);
  bs = {a, a};
  fs.resize(2);
  bs[0].position = {-.1, .2};
  bs[1].position = {.1, .2};
  bs[1].mass = 2;
  Link pulley{10, 0, 1, {0, 0}, {}, {}, 2 * std::hypot(.1, .2), 0, 0};
  for (int i = 0; i < 300; ++i)
    assert(solver.step(bs, {pulley}, fs, 9.81, .001, -1, {}));
  assert(length(bs[0].position) + length(bs[1].position) < pulley.length + .0001);
  assert(bs[1].position.y > bs[0].position.y);
  solver.reset();
  bs = {a};
  bs[0].position = {1.2, 0};
  fs.assign(1, {0, 2});
  Link elastic{LinkKind::Spring, 0, -1, {}, {}, {}, 1, 20, 1};
  Link guide{LinkKind::SpringGuide, 0, -1, {}, {}, {}, 0, 0, 0, -1, 3.141592653589793};
  Link orientation = guide;
  orientation.pulley = 0;
  for (int i = 0; i < 1000; ++i) assert(solver.step(bs, {elastic, guide, orientation}, fs, 0, .001, -1, {}));
  assert(std::abs(bs[0].position.y) < 1e-8);
  assert(std::abs(bs[0].angle) < 1e-8);
  assert(std::abs(bs[0].position.x - 1.2) > .01);
  solver.reset();
  bs = {a};
  bs[0].position = {1.2, 0};
  for (int i = 0; i < 300; ++i) assert(solver.step(bs, {elastic}, fs, 0, .001, -1, {}));
  assert(bs[0].position.y > .05);
  solver.reset();
  bs = {a, a, a};
  bs[0].fixed = true;
  bs[1].position.x = .05;
  bs[2].position.x = .1;
  Link weldA{LinkKind::Weld, 1, 0, {}, {-.05, 0}, {}, 0, 0, 0};
  Link weldB{LinkKind::Weld, 2, 1, {}, {-.05, 0}, {}, 0, 0, 0};
  fs.assign(3, {});
  fs[2] = {0, 100};
  for (int i = 0; i < 1000; ++i) assert(solver.step(bs, {weldA, weldB}, fs, 9.81, .001, -1, {}));
  assert(length(bs[1].position - Vec2{.05, 0}) < 1e-5);
  assert(length(bs[2].position - Vec2{.1, 0}) < 1e-5);
  std::cout << "PASS guided spring extension, bearing swing and welded assembly under load\n";
  std::cout << "PASS: free fall, force, rope drag, Hooke, resting solveContact, zero "
               "friction, Coulomb friction, rotating pin, ideal pulley\n";
}
