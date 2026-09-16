#include "core.hpp"
#include "expression.hpp"
#include <cstring>

namespace {
constexpr int MAX_BODIES=200, MAX_LINKS=400, STRIDE=17, HISTORY=512;
constexpr double H=1./240.;
double input[MAX_BODIES*STRIDE+MAX_LINKS*16];
double output[MAX_BODIES*6];
double observables[MAX_BODIES*20];
std::array<V,MAX_BODIES> gravityVectors{},beforeVelocity{};
std::array<double,MAX_BODIES> beforeOmega{};
double history[HISTORY][MAX_BODIES*6];
char formulas[768];
std::vector<Body> bodies;
std::vector<Link> links;
std::vector<V> forces;
std::array<std::array<Expression,3>,MAX_BODIES> paths;
std::array<bool,MAX_BODIES> driven{};
double gravity=9.81;
int tick=0;
bool valid=true;
void record(){double* dst=history[tick%HISTORY];for(size_t i=0;i<bodies.size();++i){const auto& b=bodies[i];dst[i*6]=b.p.x;dst[i*6+1]=b.p.y;dst[i*6+2]=b.angle;dst[i*6+3]=b.v.x;dst[i*6+4]=b.v.y;dst[i*6+5]=b.omega;}}
bool bounded(double v){return std::isfinite(v)&&std::abs(v)<1e8;}
}
extern "C" {
double* engine_input(){return input;}
double* engine_output(){return output;}
char* engine_formulas(){return formulas;}
double* engine_observables(){return observables;}
int engine_reset(int count,int nlinks,double g){
 if(count<1||count>MAX_BODIES||nlinks<0||nlinks>MAX_LINKS||!bounded(g)||std::abs(g)>100)return 1;
 bodies.resize(count);forces.resize(count);links.resize(nlinks);driven.fill(false);gravityVectors.fill({});std::fill(std::begin(observables),std::end(observables),0);gravity=g;tick=0;valid=true;
 for(int i=0;i<count;++i){double* p=input+i*STRIDE;for(int j=0;j<STRIDE;++j)if(!bounded(p[j]))return 1;if(p[3]<.001||p[4]<.001||p[6]<0||(p[6]==0&&p[12]==0)||p[7]<0||p[8]<0||p[8]>1)return 1;bodies[i]={(int)p[0],{p[1],p[2]},{p[9],p[10]},p[3],p[4],p[5],p[6],p[7],p[8],p[11],p[12]==1,p[12]==2};forces[i]={p[13]+p[15]*p[6],p[14]+p[16]*p[6]};}
 for(int i=0;i<nlinks;++i){double* p=input+MAX_BODIES*STRIDE+i*16;for(int j=0;j<16;++j)if(!bounded(p[j]))return 1;if(p[1]<0||p[1]>=count||p[2]<-1||p[2]>=count||p[9]<0||p[10]<0||p[11]<0||p[12]<-1||p[12]>=count)return 1;links[i]={(int)p[0],(int)p[1],(int)p[2],{p[3],p[4]},{p[5],p[6]},{p[7],p[8]},p[9],p[10],p[11],(int)p[12],p[13]};}
 record();return 0;
}
int engine_body(int i,int field,double v){
 if(i<0||i>=(int)bodies.size()||!bounded(v))return 1;auto& b=bodies[i];
 switch(field){case 1:b.p.x=v;break;case 2:b.p.y=v;break;case 3:if(v<.001)return 1;b.w=v;break;case 4:if(v<.001)return 1;b.h=v;break;case 5:b.angle=v;break;case 6:if(v<0||(v==0&&!b.fixed&&!b.kinematic))return 1;b.mass=v;break;case 7:if(v<0)return 1;b.mu=v;break;case 8:if(v<0||v>1)return 1;b.e=v;break;case 9:b.v.x=v;break;case 10:b.v.y=v;break;case 11:b.omega=v;break;default:return 1;}record();return 0;
}
int engine_gravity_vector(int i,double x,double y){if(i<0||i>=(int)bodies.size()||!bounded(x)||!bounded(y))return 1;gravityVectors[i]={x,y};return 0;}
int engine_force(int i,double fx,double fy,double ax,double ay){if(i<0||i>=(int)bodies.size()||!bounded(fx)||!bounded(fy)||!bounded(ax)||!bounded(ay))return 1;forces[i]={fx+ax*bodies[i].mass,fy+ay*bodies[i].mass};return 0;}
int engine_gravity(double g){if(!bounded(g)||std::abs(g)>100)return 1;gravity=g;return 0;}
int engine_link(int i,double length,double k,double damping){if(i<0||i>=(int)links.size()||!bounded(length)||length<0||!bounded(k)||k<0||!bounded(damping)||damping<0)return 1;links[i].length=length;links[i].k=k;links[i].damping=damping;return 0;}
int engine_trajectory(int i,int enabled){
 if(i<0||i>=(int)bodies.size())return 1;
 try{if(enabled){std::array<Expression,3> parsed;for(int j=0;j<3;++j){formulas[j*256+255]=0;parsed[j].compile(formulas+j*256);parsed[j].at(tick*H);}paths[i]=std::move(parsed);}}
 catch(...){return 2;}driven[i]=enabled;bodies[i].kinematic=enabled;
 if(enabled){auto x=paths[i][0].at(tick*H),y=paths[i][1].at(tick*H),a=paths[i][2].at(tick*H);bodies[i].p={x.v,y.v};bodies[i].v={x.d,y.d};bodies[i].angle=a.v;bodies[i].omega=a.d;}record();return 0;
}
int engine_tick(int drag,double x,double y){
 if(!valid||drag< -1||drag>=(int)bodies.size()||!bounded(x)||!bounded(y))return 1;
 try{
  for(size_t i=0;i<bodies.size();++i){auto& b=bodies[i];beforeVelocity[i]=b.v;beforeOmega[i]=b.omega;b.normalImpulse=b.frictionImpulse=b.springImpulse=b.jointImpulse=b.ropeImpulse=b.externalImpulse={};b.torqueImpulse=0;}
  double maxDt=H/8;
  // Travel limits only for potentially intersecting swept bounds, so isolated
  // free-falling bodies do not force excessive substeps for an unrelated wall.
  struct Swept {int i;double x0,x1,y0,y1,speed;};
  static std::vector<Swept> swept;
  swept.resize(bodies.size());
  for(size_t i=0;i<bodies.size();++i){const auto& b=bodies[i];double speed=norm(b.v)+std::abs(b.omega)*std::hypot(b.w,b.h)/2,reach=speed*H+.5*std::abs(gravity)*H*H,ex=extent(b,{1,0})+reach,ey=extent(b,{0,1})+reach;swept[i]={(int)i,b.p.x-ex,b.p.x+ex,b.p.y-ey,b.p.y+ey,speed};}
  std::sort(swept.begin(),swept.end(),[](const Swept& a,const Swept& b){return a.x0<b.x0;});
  for(size_t i=0;i<swept.size();++i)for(size_t j=i+1;j<swept.size()&&swept[j].x0<=swept[i].x1;++j){const auto& aa=swept[i];const auto& bb=swept[j];const auto& a=bodies[aa.i];const auto& b=bodies[bb.i];if(aa.y1<bb.y0||bb.y1<aa.y0||(a.inv()==0&&b.inv()==0))continue;maxDt=std::min(maxDt,.2*std::min({a.w,a.h,b.w,b.h})/std::max(aa.speed+bb.speed,1e-9));}
  for(const auto& l:links)if(l.kind==3&&l.k>0){double inv=bodies[l.a].inv()+(l.b>=0?bodies[l.b].inv():0);if(inv>0)maxDt=std::min(maxDt,.15/std::sqrt(l.k*inv));}
  int sub=(int)std::ceil(H/maxDt);if(sub>256){valid=false;return 3;}
  double dt=H/sub;
  for(int s=0;s<sub;++s){double t=tick*H+(s+1)*dt;for(size_t i=0;i<bodies.size();++i)if(driven[i]){auto px=paths[i][0].at(t),py=paths[i][1].at(t),pa=paths[i][2].at(t);bodies[i].p={px.v,py.v};bodies[i].v={px.d,py.d};bodies[i].angle=pa.v;bodies[i].omega=pa.d;}
   step(bodies,links,forces,gravity,dt,drag,{x,y});
  }
  for(const auto& b:bodies)for(double v:{b.p.x,b.p.y,b.v.x,b.v.y,b.angle,b.omega})if(!bounded(v)){valid=false;return 4;}
  for(size_t i=0;i<bodies.size();++i){const auto& b=bodies[i];V acc=(b.v-beforeVelocity[i])*(1/H),fg=(gravityVectors[i]+V{0,gravity})*b.mass,n=b.normalImpulse*(1/H),f=b.frictionImpulse*(1/H),s=b.springImpulse*(1/H),r=b.jointImpulse*(1/H),t=b.ropeImpulse*(1/H),net=acc*b.mass,weight=(n+s+r+t)*(-1);double values[]={acc.x,acc.y,fg.x,fg.y,n.x,n.y,f.x,f.y,s.x,s.y,r.x,r.y,t.x,t.y,net.x,net.y,weight.x,weight.y,b.torqueImpulse/H,(b.omega-beforeOmega[i])/H};std::copy(values,values+20,observables+i*20);}
  ++tick;record();return 0;
 }catch(...){valid=false;return 2;}
}
double engine_time(){return tick*H;}
// Dynamic relaxation seeks a static force/torque balance. The residual is
// measured BEFORE damping, so damping cannot masquerade as equilibrium.
double engine_relax(){double residual=0;for(size_t i=0;i<bodies.size();++i){auto& b=bodies[i];if(b.inv()==0&&b.ii()==0)continue;double* d=observables+i*20;residual=std::max({residual,norm(b.v),std::abs(b.omega),std::hypot(d[0],d[1]),std::abs(d[19])});b.v=b.v*.9;b.omega*=.9;}return residual;}
// Piecewise cubic Hermite trajectories, with a linear fallback at impulses.
int engine_sample(double t){
 if(!std::isfinite(t)||t<0||t>tick*H+1e-10||t<std::max(0,tick-HISTORY+1)*H)return 1;
 double frame=t/H;int i=std::min(tick,(int)std::floor(frame+1e-10)),j=std::min(tick,i+1);double u=std::clamp(frame-i,0.,1.);const double* a=history[i%HISTORY];const double* b=history[j%HISTORY];
 for(size_t n=0;n<bodies.size();++n)for(int c=0;c<3;++c){int k=n*6+c;double delta=b[k]-a[k],avg=(a[k+3]+b[k+3])*.5*H;bool smooth=std::abs(delta-avg)<.05*std::max(std::abs(delta),1e-6);output[k]=smooth?(2*u*u*u-3*u*u+1)*a[k]+(u*u*u-2*u*u+u)*H*a[k+3]+(-2*u*u*u+3*u*u)*b[k]+(u*u*u-u*u)*H*b[k+3]:a[k]+delta*u;output[k+3]=a[k+3]+(b[k+3]-a[k+3])*u;}
 return 0;
}
}
