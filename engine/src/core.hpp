#pragma once
#include <algorithm>
#include <array>

#include <cmath>
#include <limits>



#include <vector>
struct V {
  double x = 0, y = 0;
  V operator+(V b) const { return {x + b.x, y + b.y}; }
  V operator-(V b) const { return {x - b.x, y - b.y}; }
  V operator*(double s) const { return {x * s, y * s}; }
};
double dot(V a, V b) { return a.x * b.x + a.y * b.y; }
double cross(V a, V b) { return a.x * b.y - a.y * b.x; }
double norm(V a) { return std::sqrt(dot(a, a)); }
V unit(V a) { return a * (1 / std::max(norm(a), 1e-10)); }
V rot(V a, double r) {
  return {a.x * cos(r) - a.y * sin(r), a.x * sin(r) + a.y * cos(r)};
}
V perp(V a) { return {-a.y, a.x}; }
struct Body {
  int kind;
  V p, v;
  double w, h, angle, mass, mu, e, omega;
  bool fixed;
  bool kinematic = false;
  V normalImpulse{}, frictionImpulse{}, springImpulse{}, jointImpulse{}, ropeImpulse{}, externalImpulse{};
  double torqueImpulse=0;
  mutable double cachedAngle=std::numeric_limits<double>::quiet_NaN();
  mutable V cachedX{},cachedY{};
  V axis(int i)const{if(angle!=cachedAngle){cachedAngle=angle;cachedX={std::cos(angle),std::sin(angle)};cachedY={-cachedX.y,cachedX.x};}return i?cachedY:cachedX;}
  double inv() const { return fixed || kinematic ? 0 : 1 / mass; }
  double ii() const {
    return kinematic || (fixed && kind!=5) || mass<=0 ? 0
                 : 1 / (mass * (kind == 1 || kind == 5 ? w * w / 8
                                                       : (w * w + h * h) / 12));
  }
};
struct Link {
  int kind, a, b;
  V anchor, la, lb;
  double length, k, damping;
  int pulley = -1;
  double referenceAngle=0;
  mutable double material=0;
  mutable bool initialized=false;
};
void impulse(Body &a, V j, V r, int category=0) {
  a.v = a.v + j * a.inv();
  a.omega += cross(r, j) * a.ii();
  if(category==1)a.normalImpulse=a.normalImpulse+j;
  if(category==2)a.frictionImpulse=a.frictionImpulse+j;
  if(category==3)a.springImpulse=a.springImpulse+j;
  if(category==4)a.jointImpulse=a.jointImpulse+j;
  if(category==5)a.ropeImpulse=a.ropeImpulse+j;
  a.torqueImpulse+=cross(r,j);
}
V velocity(const Body &a, V r) { return a.v + perp(r) * a.omega; }
// A surface collides as the finite visible segment, including its reverse side.
V contactCenter(const Body& a) { return a.kind==9 ? a.p-a.axis(1)*(a.h/2) : a.p; }
double contactHeight(const Body& a) { return a.kind==9 ? 0 : a.h; }
double extent(const Body &a, V axis) {
  if (a.kind == 1 || a.kind == 5)
    return a.w / 2;
  return std::abs(dot(a.axis(0), axis)) * a.w / 2 +
         std::abs(dot(a.axis(1), axis)) * contactHeight(a) / 2;
}
std::pair<double, double> feature(const Body &a, V n, V t) {
  if (a.kind == 1 || a.kind == 5) {
    double v = dot(a.p, t);
    return {v, v};
  }
  V q={dot(n,a.axis(0)),dot(n,a.axis(1))};double lo=1e30,hi=-1e30;
  for(int sign:{-1,1}){
    V v=std::abs(q.x)>std::abs(q.y)?V{std::copysign(a.w/2,q.x),sign*contactHeight(a)/2}:V{sign*a.w/2,std::copysign(contactHeight(a)/2,q.y)};
    double value=dot(contactCenter(a)+a.axis(0)*v.x+a.axis(1)*v.y,t);lo=std::min(lo,value);hi=std::max(hi,value);
  }
  return {lo, hi};
}
double faceHeight(const Body& a,V n,V t,double tangent){
  if(a.kind==1||a.kind==5)return dot(a.p,n)+a.w/2;
  V q={dot(n,a.axis(0)),dot(n,a.axis(1))},axis=std::abs(q.x)>std::abs(q.y)?a.axis(0)*std::copysign(1.,q.x):a.axis(1)*std::copysign(1.,q.y);
  double e=std::abs(q.x)>std::abs(q.y)?a.w/2:contactHeight(a)/2;
  return (e+dot(contactCenter(a),axis)-tangent*dot(t,axis))/dot(n,axis);
}
// SAT narrow phase; the solver supplies broad-phase candidate pairs.
void contact(Body &a, Body &b) {
  if (a.inv() == 0 && b.inv() == 0)
    return;
  V d = contactCenter(b) - contactCenter(a), n;
  double depth = 1e30;
  std::array<V,5> axes = {a.axis(0), a.axis(1),b.axis(0),b.axis(1)};
  int axisCount = 4;
  bool ac = a.kind == 1 || a.kind == 5, bc = b.kind == 1 || b.kind == 5;
  if (ac && bc) {
    axes[0] = norm(d)>1e-10?unit(d):V{0,1}; axisCount = 1;
  }
  else if (ac || bc) {
    Body &box = ac ? b : a;
    Body &circle = ac ? a : b;
    V local = rot(circle.p - contactCenter(box), -box.angle);
    V closest = {std::clamp(local.x, -box.w / 2, box.w / 2),
                 std::clamp(local.y, -contactHeight(box) / 2, contactHeight(box) / 2)};
    V corner = circle.p - (contactCenter(box) + rot(closest, box.angle));
    if (norm(corner) > 1e-9)
      axes[axisCount++] = unit(corner);
  }
  for (int axisIndex=0;axisIndex<axisCount;++axisIndex) {
    V axis=axes[axisIndex];
    double overlap = extent(a, axis) + extent(b, axis) - std::abs(dot(d, axis));
    if (overlap < -0.00001)
      return;
    if (overlap < depth) {
      depth = overlap;
      n = axis * (dot(d, axis) < 0 ? -1 : 1);
    }
  }
  if (norm(n) < .5)
    n = {0, 1};
  double ia = a.inv(), ib = b.inv();
  V correction = n * (std::max(0., depth - .00001) * .6 / (ia + ib));
  a.p = a.p - correction * ia;
  b.p = b.p + correction * ib;
  // Clip support features against the tangent overlap: up to two contacts.
  V t = perp(n);
  auto fa = feature(a, n, t), fb = feature(b, n * (-1), t);
  double lo = std::max(fa.first, fb.first), hi = std::min(fa.second, fb.second);
  int contacts=hi-lo>1e-6?2:1;
  for(int ci=0;ci<contacts;++ci){
  double tangent=contacts==1?(lo+hi)*.5:ci==0?lo:hi;
  double ha=faceHeight(a,n,t,tangent),hb=-faceHeight(b,n*(-1),t,tangent);
  if(ha-hb < -.00002)continue;
  V cp=n*((ha+hb)*.5)+t*tangent;
  V ra = cp - a.p, rb = cp - b.p, rv = velocity(b, rb) - velocity(a, ra);
  double vn = dot(rv, n);
  if (vn >= 0)
    continue;
  double denom = ia + ib + std::pow(cross(ra, n), 2) * a.ii() +
                 std::pow(cross(rb, n), 2) * b.ii();
  double j = -(1 + (vn < -.1 ? std::min(a.e, b.e) : 0)) * vn / denom;
  impulse(a, n * (-j), ra,1);
  impulse(b, n * j, rb,1);
  rv = velocity(b, rb) - velocity(a, ra);
  double jt = -dot(rv, t) / (ia + ib + std::pow(cross(ra, t), 2) * a.ii() +
                             std::pow(cross(rb, t), 2) * b.ii());
  jt = std::clamp(jt, -j * std::sqrt(a.mu * b.mu), j * std::sqrt(a.mu * b.mu));
  impulse(a, t * (-jt), ra,2);
  impulse(b, t * jt, rb,2);
  }
}
void constrain(std::vector<Body> &bs, const Link &l) {
  if (l.a < 0 || l.a >= (int)bs.size())
    return;
  Body &a = bs[l.a];
  Body *b = l.b >= 0 ? &bs[l.b] : nullptr;
  if(l.kind==2||l.kind==12){
    V ra=rot(l.la,a.angle),rb=b?rot(l.lb,b->angle):V{},d=(b?b->p+rb:l.anchor)-(a.p+ra);
    double ia=a.inv(),ib=b?b->inv():0,aa=a.ii(),bb=b?b->ii():0;
    double xx=ia+ib+ra.y*ra.y*aa+rb.y*rb.y*bb,yy=ia+ib+ra.x*ra.x*aa+rb.x*rb.x*bb,xy=-ra.x*ra.y*aa-rb.x*rb.y*bb,det=xx*yy-xy*xy;
    if(det>1e-20){auto solve=[&](V q){return V{(yy*q.x-xy*q.y)/det,(xx*q.y-xy*q.x)/det};};V c=solve(d*.8);a.p=a.p+c*ia;a.angle+=cross(ra,c)*aa;if(b){b->p=b->p-c*ib;b->angle-=cross(rb,c)*bb;}V j=solve((b?velocity(*b,rb):V{})-velocity(a,ra));impulse(a,j,ra,4);if(b)impulse(*b,j*(-1),rb,4);}
    if(l.kind==12&&aa+bb>0){double error=(b?b->angle:0)-a.angle-l.referenceAngle,c=error*.8/(aa+bb),j=((b?b->omega:0)-a.omega)/(aa+bb);a.angle+=c*aa;a.omega+=j*aa;a.torqueImpulse+=j;if(b){b->angle-=c*bb;b->omega-=j*bb;b->torqueImpulse-=j;}}
    return;
  }
  if(l.kind==10&&b&&l.pulley>=0){
    auto& p=bs[l.pulley];double radius=p.w/2;V ra=rot(l.la,a.angle),rb=rot(l.lb,b->angle),va=a.p+ra-p.p,vb=b->p+rb-p.p;double da=norm(va),db=norm(vb);
    if(da<=radius+1e-7||db<=radius+1e-7)return;
    double ta=std::atan2(va.y,va.x)+std::acos(radius/da),tb=std::atan2(vb.y,vb.x)-std::acos(radius/db),arc=tb-ta;while(arc<0)arc+=2*3.141592653589793;while(arc>2*3.141592653589793)arc-=2*3.141592653589793;
    V na=unit(va-V{std::cos(ta),std::sin(ta)}*radius),nb=unit(vb-V{std::cos(tb),std::sin(tb)}*radius),np=(na+nb)*(-1);
    double length=std::sqrt(da*da-radius*radius)+std::sqrt(db*db-radius*radius)+radius*arc,error=length-l.length;
    if(error< -1e-5){l.initialized=false;return;}
    double ca=cross(ra,na),cb=cross(rb,nb),den=a.inv()+b->inv()+dot(np,np)*p.inv()+ca*ca*a.ii()+cb*cb*b->ii();
    if(den>0){double c=std::max(0.,error)*.8/den;a.p=a.p-na*(c*a.inv());b->p=b->p-nb*(c*b->inv());p.p=p.p-np*(c*p.inv());a.angle-=ca*c*a.ii();b->angle-=cb*c*b->ii();double j=-std::max(0.,dot(velocity(a,ra),na)+dot(velocity(*b,rb),nb)+dot(p.v,np))/den;impulse(a,na*j,ra,5);impulse(*b,nb*j,rb,5);impulse(p,np*j,{},5);}
    // No slip: the material coordinate on the first strand is coupled to Iω.
    double q=std::sqrt(da*da-radius*radius)-radius*ta;
    if(!l.initialized){l.material=q+radius*p.angle;l.initialized=true;}
    double inertiaDen=a.inv()+p.inv()+ca*ca*a.ii()+radius*radius*p.ii();
    if(inertiaDen>0){double c=(q+radius*p.angle-l.material)*.8/inertiaDen;a.p=a.p-na*(c*a.inv());p.p=p.p+na*(c*p.inv());a.angle-=ca*c*a.ii();p.angle-=radius*c*p.ii();double j=-(dot(velocity(a,ra)-p.v,na)+radius*p.omega)/inertiaDen;impulse(a,na*j,ra,5);impulse(p,na*(-j),{},5);p.omega+=radius*j*p.ii();p.torqueImpulse+=radius*j;}
    return;
  }
  if (l.kind == 10 && b) {
    V da = a.p - l.anchor, db = b->p - l.anchor, na = unit(da), nb = unit(db);
    double error = norm(da) + norm(db) - l.length, den = a.inv() + b->inv();
    if (error <= 0 || den == 0)
      return;
    double c = error * .8 / den;
    a.p = a.p - na * (c * a.inv());
    b->p = b->p - nb * (c * b->inv());
    double j = std::max(0., (dot(a.v, na) + dot(b->v, nb)) / den);
    impulse(a, na * (-j), {},5);
    impulse(*b, nb * (-j), {},5);
    return;
  }
  V ra = rot(l.la, a.angle), rb = b ? rot(l.lb, b->angle) : V{}, pa = a.p + ra,
    pb = b ? b->p + rb : l.anchor, d = pb - pa;
  double len = norm(d);
  if (len < 1e-10)
    return;
  V n = d * (1 / len);
  double error = len - l.length;
  if (l.kind == 4 && error <= 0)
    return;
  double ia = a.inv(), ib = b ? b->inv() : 0, aa = a.ii(), bb = b ? b->ii() : 0,
         ca = cross(ra, n), cb = cross(rb, n),
         den = ia + ib + ca * ca * aa + cb * cb * bb;
  if (den == 0)
    return;
  double correction = error * .8 / den;
  a.p = a.p + n * (correction * ia);
  a.angle += ca * correction * aa;
  if (b) {
    b->p = b->p - n * (correction * ib);
    b->angle -= cb * correction * bb;
  }
  double j = dot((b ? velocity(*b, rb) : V{}) - velocity(a, ra), n) / den;
  if (l.kind == 4)
    j = std::max(0., j);
  impulse(a, n * j, ra,5);
  if (b)
    impulse(*b, n * (-j), rb,5);
}
void step(std::vector<Body> &bs, const std::vector<Link> &links,
          const std::vector<V> &forces, double g, double dt, int drag,
          V target) {
  for (size_t i = 0; i < bs.size(); ++i) {
    auto &b = bs[i];
    if (b.fixed || b.kinematic)
      continue;
    V f = forces[i] + V{0, g * b.mass};
    if ((int)i == drag) {
      V pull = (target - b.p) * (b.mass * 150) - b.v * (b.mass * 20);
      double limit = b.mass * 50;
      if (norm(pull) > limit)
        pull = unit(pull) * limit;
      f = f + pull;
    }
    b.v = b.v + f * (dt / b.mass);
    b.externalImpulse=b.externalImpulse+f*dt;
  }
  for (auto &l : links)
    if (l.kind == 3 && l.a >= 0) {
      auto &a = bs[l.a];
      Body *b = l.b >= 0 ? &bs[l.b] : nullptr;
      V ra = rot(l.la, a.angle), rb = b ? rot(l.lb, b->angle) : V{},
        d = (b ? b->p + rb : l.anchor) - (a.p + ra), n = unit(d);
      double relative = dot((b ? velocity(*b, rb) : V{}) - velocity(a, ra), n);
      V j = n * ((l.k * (norm(d) - l.length) + l.damping * relative) * dt);
      impulse(a, j, ra,3);
      if (b)
        impulse(*b, j * (-1), rb,3);
    }
  for (auto &b : bs)
    {if(!b.fixed&&!b.kinematic)b.p=b.p+b.v*dt;if(b.ii()>0)b.angle+=b.omega*dt;}
  // Sweep-and-prune broad phase; reuse allocated buffers across substeps.
  struct Bounds { size_t i; double x0,x1,y0,y1; };
  static thread_local std::vector<Bounds> bounds;
  static thread_local std::vector<std::pair<size_t,size_t>> pairs;
  static thread_local std::vector<unsigned char> joined;
  joined.assign(bs.size()*bs.size(),0);
  for(const auto& l:links)if((l.kind==2||l.kind==12)&&l.b>=0){joined[l.a*bs.size()+l.b]=1;joined[l.b*bs.size()+l.a]=1;}
  bounds.resize(bs.size());
  for (int iter = 0; iter < 24; ++iter) {
    for (auto &l : links)
      if (l.kind != 3)
        constrain(bs, l);
    if(iter%4==0){
      for(size_t i=0;i<bs.size();++i){const auto& b=bs[i];double ex=extent(b,{1,0})+.0001,ey=extent(b,{0,1})+.0001;V center=contactCenter(b);bounds[i]={i,center.x-ex,center.x+ex,center.y-ey,center.y+ey};}
      std::sort(bounds.begin(),bounds.end(),[](const Bounds& a,const Bounds& b){return a.x0==b.x0?a.i<b.i:a.x0<b.x0;});
      pairs.clear();
      for(size_t i=0;i<bounds.size();++i)for(size_t j=i+1;j<bounds.size()&&bounds[j].x0<=bounds[i].x1;++j){auto a=bounds[i],b=bounds[j];if(a.y1<b.y0||b.y1<a.y0||joined[a.i*bs.size()+b.i]||(bs[a.i].inv()==0&&bs[b.i].inv()==0))continue;pairs.emplace_back(std::min(a.i,b.i),std::max(a.i,b.i));}
      std::sort(pairs.begin(),pairs.end());
    }
    for(auto pair:pairs)contact(bs[pair.first],bs[pair.second]);
  }
}
