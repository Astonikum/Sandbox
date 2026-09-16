#include "core.hpp"
#include <cassert>
#include <iomanip>
#include <iostream>
#include <string>
int main(int argc, char **argv) {
  std::cout << std::setprecision(15);
  if (argc > 1 && std::string(argv[1]) == "--test") {
    Body a{0, {0, 0}, {0, 0}, .1, .1, 0, 1, 0, 0, 0, false};
    std::vector<Body> bs{a};
    std::vector<V> fs(1);
    for (int i = 0; i < 1000; ++i)
      step(bs, {}, fs, 9.81, .001, -1, {});
    assert(std::abs(bs[0].v.y - 9.81) < 1e-8);
    assert(std::abs(bs[0].p.y - 4.905) < .006);
    bs = {a};
    fs[0] = {2, 0};
    for (int i = 0; i < 1000; ++i)
      step(bs, {}, fs, 0, .001, -1, {});
    assert(std::abs(bs[0].v.x - 2) < 1e-8);
    bs = {a};
    bs[0].p = {.1, 0};
    fs[0] = {};
    Link rope{4, 0, -1, {0, 0}, {}, {}, .1, 0, 0};
    for (int i = 0; i < 500; ++i)
      step(bs, {rope}, fs, 9.81, .001, 0, {1, 1});
    assert(norm(bs[0].p) < .1001);
    bs = {a};
    bs[0].p = {.15, 0};
    Link spring{3, 0, -1, {0, 0}, {}, {}, .1, 10, 0};
    step(bs, {spring}, fs, 0, .001, -1, {});
    assert(bs[0].v.x < 0);
    Body floor = a;
    floor.fixed = true;
    floor.p = {0, .2};
    floor.w = 2;
    floor.h = .1;
    bs = {a, floor};
    fs.resize(2);
    for (int i = 0; i < 2000; ++i)
      step(bs, {}, fs, 9.81, .001, -1, {});
    assert(std::abs(bs[0].p.y - .1) < .0002);
    assert(std::abs(bs[0].v.y) < .001);
    bs = {a, floor};
    bs[0].p = {0, .1};
    bs[0].v = {1, 0};
    for (int i = 0; i < 500; ++i)
      step(bs, {}, fs, 9.81, .001, -1, {});
    assert(std::abs(bs[0].v.x - 1) < .001);
    bs = {a, floor};
    bs[0].p = {0, .1};
    bs[0].v = {1, 0};
    bs[0].mu = bs[1].mu = .5;
    for (int i = 0; i < 500; ++i)
      step(bs, {}, fs, 9.81, .001, -1, {});
    assert(std::abs(bs[0].v.x) < .02);
    bs = {a};
    fs.resize(1);
    bs[0].p = {.1, 0};
    Link pin{2, 0, -1, {0, 0}, {-.1, 0}, {}, 0, 0, 0};
    for (int i = 0; i < 500; ++i)
      step(bs, {pin}, fs, 9.81, .001, -1, {});
    assert(norm(bs[0].p + rot({-.1, 0}, bs[0].angle)) < .0001);
    assert(std::abs(bs[0].angle) > .1);
    bs = {a, a};
    fs.resize(2);
    bs[0].p = {-.1, .2};
    bs[1].p = {.1, .2};
    bs[1].mass = 2;
    Link pulley{10, 0, 1, {0, 0}, {}, {}, 2 * std::hypot(.1, .2), 0, 0};
    for (int i = 0; i < 300; ++i)
      step(bs, {pulley}, fs, 9.81, .001, -1, {});
    assert(norm(bs[0].p) + norm(bs[1].p) < pulley.length + .0001);
    assert(bs[1].p.y > bs[0].p.y);
    std::cout
        << "PASS: free fall, force, rope drag, Hooke, resting contact, zero "
           "friction, Coulomb friction, rotating pin, ideal pulley\n";
    return 0;
  }
  int count, nlinks, drag;
  double g, dt;
  V target;
  while (std::cin >> count >> nlinks >> g >> dt >> drag >> target.x >>
         target.y) {
    if (count < 0 || count > 200 || nlinks < 0 || nlinks > 400 || dt <= 0 ||
        dt > .05 || !std::isfinite(g) || std::abs(g) > 100 ||
        !std::isfinite(dt) || !std::isfinite(target.x) ||
        !std::isfinite(target.y))
      return 1;
    std::vector<Body> bs(count);
    std::vector<V> fs(count);
    std::vector<Link> ls(nlinks);
    for (int i = 0; i < count; ++i) {
      auto &b = bs[i];
      std::cin >> b.kind >> b.p.x >> b.p.y >> b.w >> b.h >> b.angle >> b.mass >>
          b.mu >> b.e >> b.v.x >> b.v.y >> b.omega >> b.fixed >> fs[i].x >>
          fs[i].y;
      if (b.mass <= 0 || b.w < .001 || b.h < .001 || b.mu < 0 || b.e < 0 ||
          b.e > 1)
        return 1;
      for (double v : {b.p.x, b.p.y, b.w, b.h, b.angle, b.mass, b.mu, b.e,
                       b.v.x, b.v.y, b.omega, fs[i].x, fs[i].y})
        if (!std::isfinite(v) || std::abs(v) > 1e8)
          return 1;
    }
    for (auto &l : ls) {
      std::cin >> l.kind >> l.a >> l.b >> l.anchor.x >> l.anchor.y >> l.la.x >>
          l.la.y >> l.lb.x >> l.lb.y >> l.length >> l.k >> l.damping;
      if (l.a < 0 || l.a >= count || l.b >= count || l.b < -1 || l.length < 0 ||
          l.k < 0 || l.damping < 0)
        return 1;
      for (double v : {l.anchor.x, l.anchor.y, l.la.x, l.la.y, l.lb.x, l.lb.y,
                       l.length, l.k, l.damping})
        if (!std::isfinite(v) || std::abs(v) > 1e8)
          return 1;
    }
    if (!std::cin)
      return 1;
    int sub = std::max(1, (int)std::ceil(dt / .0005));
    for (int k = 0; k < sub; ++k)
      step(bs, ls, fs, g, dt / sub, drag, target);
    for (auto &b : bs)
      std::cout << b.p.x << ' ' << b.p.y << ' ' << b.angle << ' ' << b.v.x
                << ' ' << b.v.y << ' ' << b.omega << ' ';
    std::cout << std::endl;
  }
}
