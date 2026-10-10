#include "../src/core.hpp"
#include "../src/ccd.hpp"
#include "../src/runtime.hpp"
#include <cassert>
#include <cstring>
#include <iostream>
#include <memory>
#include <random>

static Body projectile(int kind, Vec2 position, Vec2 velocity) {
  return {kind, position, velocity, .02, .02, 0, 1, 0, 1, 0, false};
}
static Body surface(Vec2 position, double angle) {
  return {BodyKind::Surface, position, {}, 4, .001, angle, 0, 0, 1, 0, true};
}
static double energy(const Body &body) {
  return .5 * body.mass * dot(body.velocity, body.velocity) +
         (body.inverseInertia() > 0 ? .5 * body.angularVelocity * body.angularVelocity / body.inverseInertia() : 0);
}
int main() {
  constexpr double pi = 3.141592653589793;
  for (int kind : {BodyKind::Rectangle, BodyKind::Circle})
    for (double angle : {0., .37, pi / 2})
      for (double side : {-1., 1.})
        for (double restitution : {0., 1.}) {
          const Vec2 direction{side * std::cos(angle), side * std::sin(angle)};
          Body bullet = projectile(kind, direction * (-.5), direction * 200);
          bullet.angle = angle;
          bullet.restitution = restitution;
          std::vector<Body> bodies{bullet, surface({}, angle + pi / 2)};
          Solver solver;
          assert(solver.step(bodies, {}, std::vector<Vec2>(2), 0, .01, -1, {}));
          const double expected = restitution == 0 ? -.01 : -1.52;
          assert(std::abs(dot(bodies[0].position, direction) - expected) < 2e-6);
          assert(std::abs(dot(bodies[0].velocity, direction) + restitution * 200) < 1e-7);
          assert(length(bodies[0].normalImpulse + bodies[1].normalImpulse) < 1e-7);
          assert(length(bodies[0].normalImpulse - (bodies[0].velocity - bullet.velocity)) < 1e-7);
        }
  std::cout << "PASS CCD thin surfaces: both sides, rotation, circles/boxes, restitution and impulse ledger\n";
  {
    auto a = projectile(BodyKind::Circle, {-1, 0}, {200, 0});
    auto b = projectile(BodyKind::Circle, {1, 0}, {-100, 0});
    b.mass = 2;
    std::vector<Body> bodies{a, b};
    Solver solver;
    assert(solver.step(bodies, {}, std::vector<Vec2>(2), 0, .02, -1, {}));
    assert(std::abs(bodies[0].velocity.x + 200) < 1e-7);
    assert(std::abs(bodies[1].velocity.x - 100) < 1e-7);
    assert(bodies[0].position.x < bodies[1].position.x);
    assert(std::abs(energy(bodies[0]) + energy(bodies[1]) - energy(a) - energy(b)) < 1e-6);
    assert(length(bodies[0].normalImpulse + bodies[1].normalImpulse) < 1e-7);
  }
  {
    std::vector<Body> bodies{projectile(BodyKind::Circle, {}, {1000, 0}),
                             surface({.5, 0}, pi / 2), surface({-.5, 0}, pi / 2)};
    Solver solver;
    assert(solver.step(bodies, {}, std::vector<Vec2>(3), 0, .005, -1, {}));
    assert(std::abs(bodies[0].position.x + .1) < 3e-6);
    assert(std::abs(bodies[0].velocity.x + 1000) < 1e-6);
    assert(std::abs(bodies[0].normalImpulse.x + 2000) < 1e-6);
    assert(length(bodies[0].normalImpulse + bodies[1].normalImpulse + bodies[2].normalImpulse) < 1e-6);
    solver.reset();
    bodies[0].velocity = {1e7, 0};
    assert(!solver.step(bodies, {}, std::vector<Vec2>(3), 0, .01, -1, {}));
  }
  {
    std::vector<Body> bodies{projectile(BodyKind::Circle, {-.5, -.5}, {100, 100}),
                             surface({}, pi / 2), surface({}, 0)};
    Solver solver;
    assert(solver.step(bodies, {}, std::vector<Vec2>(3), 0, .01, -1, {}));
    assert(length(bodies[0].velocity - Vec2{-100, -100}) < 1e-7);
    assert(length(bodies[0].position - Vec2{-.52, -.52}) < 2e-6);
  }
  std::cout << "PASS CCD moving pairs, energy, repeated impacts, simultaneous corner and event budget\n";
  {
    Body bar = projectile(BodyKind::Rectangle, {}, {});
    bar.width = 2;
    bar.height = .01;
    bar.angularVelocity = pi / .01;
    bar.restitution = 0;
    Body obstacle = projectile(BodyKind::Circle, {0, .8}, {});
    obstacle.width = obstacle.height = .06;
    obstacle.fixed = true;
    const auto impact = timeOfImpact(bar, {{}, pi}, obstacle, {});
    assert(impact.converged && impact.hit && impact.fraction > .4 && impact.fraction < .5);
    std::vector<Body> bodies{bar, obstacle};
    Solver solver;
    assert(solver.step(bodies, {}, std::vector<Vec2>(2), 0, .01, -1, {}));
    assert(bodies[0].angularVelocity < bar.angularVelocity);
    assert(length(bodies[0].normalImpulse) > 1);
    assert(energy(bodies[0]) <= energy(bar) + 1e-6);
  }
  {
    Body bullet = projectile(BodyKind::Circle, {-1, .6}, {200, 0});
    Body wall = surface({}, pi / 2);
    wall.width = 1;
    const auto impact = timeOfImpact(bullet, {{2, 0}, 0}, wall, {});
    assert(impact.converged && !impact.hit);
    std::vector<Body> bodies{bullet, wall};
    Solver solver;
    assert(solver.step(bodies, {}, std::vector<Vec2>(2), 0, .01, -1, {}));
    assert(std::abs(bodies[0].position.x - 1) < 1e-12);
    assert(bodies[0].velocity.x == 200);
  }
  std::cout << "PASS rotational CCD and finite-surface miss\n";
  {
    std::mt19937 random(814);
    std::uniform_real_distribution<double> value(-2, 2);
    for (int scene = 0; scene < 300; ++scene) {
      Body box = projectile(BodyKind::Rectangle, {}, {});
      box.width = 2;
      box.height = .1;
      box.angle = value(random);
      Body circle = projectile(BodyKind::Circle, {value(random), value(random)}, {});
      circle.width = circle.height = .06;
      const BodySweep sweep{{value(random), value(random)}, value(random) * 3};
      auto gap = [&](double fraction) {
        const Vec2 local = rotated(circle.position - box.position - sweep.translation * fraction,
                                   -box.angle - sweep.rotation * fraction);
        const double x = std::max(0., std::abs(local.x) - box.width / 2),
                     y = std::max(0., std::abs(local.y) - box.height / 2);
        return std::hypot(x, y) - circle.width / 2;
      };
      if (gap(0) <= 1e-6)
        continue;
      const auto impact = timeOfImpact(box, sweep, circle, {});
      assert(impact.converged);
      if (impact.hit)
        assert(std::abs(gap(impact.fraction)) < 3e-7);
      for (int sample = 1; sample <= 2000; ++sample)
        if (gap(sample / 2000.) < -2 * CcdDistance) {
          assert(impact.hit && impact.fraction <= sample / 2000. + 1e-9);
          break;
        }
    }
  }
  std::cout << "PASS CCD randomized rotation and translation against point-to-box distance\n";
  {
    using namespace protocol;
    auto runtime = std::make_unique<Runtime>();
    const double bullet[BodyStride] = {BodyKind::Circle, -.5, 0, .002, .002, 0, 1, 0, 0, 100000, 0, 0, 0, 0, 0, 0, 0};
    const double wall[BodyStride] = {BodyKind::Surface, 0, 0, 2, .001, pi / 2, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0};
    std::copy(std::begin(bullet), std::end(bullet), runtime->inputData());
    std::copy(std::begin(wall), std::end(wall), runtime->inputData() + BodyStride);
    assert(runtime->reset(2, 0, 0) == Status::Ok);
    assert(runtime->advance(-1, 0, 0) == Status::Ok);
    assert(runtime->sample(runtime->time()) == Status::Ok);
    assert(std::abs(runtime->outputData()[0] + .001) < 2e-6);
    assert(std::abs(runtime->outputData()[3]) < 1e-7);
    runtime->inputData()[BodyField::X] = .1;
    runtime->inputData()[BodyField::VelocityX] = 0;
    runtime->inputData()[BodyStride + BodyField::Motion] = 2;
    assert(runtime->reset(2, 0, 0) == Status::Ok);
    std::strcpy(runtime->formulaData(), "100000*t");
    std::strcpy(runtime->formulaData() + FormulaSize, "0");
    std::strcpy(runtime->formulaData() + 2 * FormulaSize, "pi/2");
    assert(runtime->setTrajectory(1, 1) == Status::Ok);
    assert(runtime->advance(-1, 0, 0) == Status::Ok);
    assert(runtime->sample(runtime->time()) == Status::Ok);
    assert(runtime->outputData()[0] >= runtime->outputData()[6] + .00098);
    assert(std::abs(runtime->outputData()[6] - 100000 * TickDuration) < 1e-9);
    assert(std::abs(runtime->outputData()[3] - 100000) < 1e-5);
  }
  std::cout << "PASS runtime CCD at high speed and swept kinematic trajectories\n";
  for (double friction : {0., .5}) {
    using namespace protocol;
    auto runtime = std::make_unique<Runtime>();
    for (int i = 0; i < 20; ++i) {
      const double body[BodyStride] = {BodyKind::Rectangle, i * .3, 1, .1, .1, 0, 1, friction, 0, .2, 0, 0, 0, 0, 0, 0, 0};
      const double link[LinkStride] = {LinkKind::Rope, double(i), -1, i * .3, 0, 0, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0};
      std::copy(std::begin(body), std::end(body), runtime->inputData() + i * BodyStride);
      std::copy(std::begin(link), std::end(link), runtime->inputData() + MaxBodies * BodyStride + i * LinkStride);
    }
    assert(runtime->reset(20, 20, 9.81) == Status::Ok);
    for (int tick = 0; tick < 480; ++tick)
      assert(runtime->advance(0, 2, 3) == Status::Ok);
  }
  std::cout << "PASS CCD with dragged rope assembly and friction\n";

  for (int kind : {BodyKind::Rectangle, BodyKind::Circle})
    for (double side : {-1., 1.}) {
      auto body = projectile(kind, {side * .005, 0}, {});
      body.restitution = 0;
      std::vector<Body> bodies{body, surface({}, pi / 2)};
      Solver solver;
      assert(solver.step(bodies, {}, std::vector<Vec2>(2), 0, .001, -1, {}));
      assert(side * bodies[0].position.x >= .01 - 2 * PositionTolerance);
      assert(length(bodies[0].velocity) == 0);
      assert(length(bodies[0].normalImpulse) == 0);
    }
  {
    auto a = projectile(BodyKind::Circle, {}, {}), b = a;
    b.mass = 3;
    std::vector<Body> bodies{a, b};
    Solver solver;
    assert(solver.step(bodies, {}, std::vector<Vec2>(2), 0, .001, -1, {}));
    assert(length(bodies[1].position - bodies[0].position) >= .02 - 2 * PositionTolerance);
    assert(length(bodies[0].position + bodies[1].position * 3) < 1e-12);
    assert(energy(bodies[0]) + energy(bodies[1]) == 0);
  }
  for (int kind : {LinkKind::Hinge, LinkKind::Rope, LinkKind::Weld, LinkKind::SpringGuide}) {
    auto body = projectile(BodyKind::Circle, {-.5, 0}, {});
    body.restitution = 0;
    std::vector<Body> bodies{body, surface({}, pi / 2)};
    Link link{kind, 0, -1, {1, 0}, {}, {}, .1, 0, 0};
    if (kind == LinkKind::SpringGuide)
      link.referenceAngle = pi / 2;
    Solver solver;
    for (int step = 0; step < 60; ++step) {
      assert(solver.step(bodies, {link}, std::vector<Vec2>(2), 0, .001, -1, {}));
      assert(bodies[0].position.x <= -.01 + 2 * PositionTolerance);
      assert(length(bodies[0].velocity) < 1e-8);
    }
  }
  {
    auto bar = projectile(BodyKind::Rectangle, {}, {});
    bar.width = 2;
    bar.height = .01;
    auto obstacle = projectile(BodyKind::Circle, {0, .8}, {});
    obstacle.width = obstacle.height = .06;
    obstacle.fixed = true;
    std::vector<Body> bodies{bar, obstacle};
    Link link{LinkKind::Weld, 0, -1, {}, {}, {}, 0, 0, 0};
    link.referenceAngle = -pi;
    Solver solver;
    assert(solver.step(bodies, {link}, std::vector<Vec2>(2), 0, .001, -1, {}));
    assert(bodies[0].angle > 1 && bodies[0].angle < pi / 2);
    Vec2 normal;
    assert(separatingDistance(bodies[0], bodies[1], normal) >= -2 * PositionTolerance);
  }
  {
    auto body = projectile(BodyKind::Circle, {}, {});
    std::vector<Body> bodies{body, surface({-.005, 0}, pi / 2), surface({.005, 0}, pi / 2)};
    Solver solver;
    assert(!solver.step(bodies, {}, std::vector<Vec2>(3), 0, .001, -1, {}));
    assert(std::abs(bodies[0].position.x) < .005);
  }
  {
    auto a = projectile(BodyKind::Circle, {-.015, 0}, {});
    auto b = projectile(BodyKind::Circle, {-.005, 0}, {});
    std::vector<Body> bodies{a, b, surface({.005, 0}, pi / 2)};
    Solver solver;
    assert(solver.step(bodies, {}, std::vector<Vec2>(3), 0, .001, -1, {}));
    assert(bodies[1].position.x <= -.005 + 2 * PositionTolerance);
    assert(bodies[1].position.x - bodies[0].position.x >= .02 - 2 * PositionTolerance);
    assert(energy(bodies[0]) + energy(bodies[1]) == 0);
  }
  {
    auto body = projectile(BodyKind::Circle, {-.005, 0}, {100000, 0});
    body.restitution = 0;
    std::vector<Body> bodies{body, surface({}, pi / 2)};
    Solver solver;
    assert(solver.step(bodies, {}, std::vector<Vec2>(2), 0, .001, -1, {}));
    assert(bodies[0].position.x <= -.01 + 2 * PositionTolerance);
    assert(std::abs(bodies[0].velocity.x) < 1e-8);
    assert(std::abs(bodies[0].normalImpulse.x + 100000) < 1e-8);
  }
  {
    auto body = projectile(BodyKind::Circle, {-.01, -.5}, {});
    std::vector<Body> bodies{body, surface({}, pi / 2)};
    Link link{LinkKind::Hinge, 0, -1, {-.01, .5}, {}, {}, 0, 0, 0};
    Solver solver;
    assert(solver.step(bodies, {link}, std::vector<Vec2>(2), 0, .001, -1, {}));
    assert(length(bodies[0].position - link.anchor) < 1e-8);
  }
  std::cout << "PASS overlap recovery, mass balance, blocked constraint translations/rotation and impossible enclosure\n";

  {
    using namespace protocol;
    auto runtime = std::make_unique<Runtime>();
    for (int i = 0; i < 40; ++i) {
      const double body[BodyStride] = {double(i % 2), ((i % 10) - 4.5) * .3, -(i / 10) * .3,
                                      .1, .1, i * .07, 1, .5, 0, 0, 0, .2, 0, 0, 0, 0, 0};
      std::copy(std::begin(body), std::end(body), runtime->inputData() + i * BodyStride);
    }
    const double floor[BodyStride] = {BodyKind::Surface, 0, 1.05, 10, .1, 0, 0, .5, 0, 0, 0, 0, 1, 0, 0, 0, 0};
    std::copy(std::begin(floor), std::end(floor), runtime->inputData() + 40 * BodyStride);
    assert(runtime->reset(41, 0, 9.81) == Status::Ok);
    for (int tick = 0; tick < 480; ++tick)
      assert(runtime->advance(-1, 0, 0) == Status::Ok);
    assert(runtime->sample(runtime->time()) == Status::Ok);
    for (int i = 0; i < 40; ++i)
      assert(runtime->outputData()[i * 6 + 1] < 1.05);
  }
  std::cout << "PASS CCD recovery propagates through a mixed falling contact assembly\n";

}
