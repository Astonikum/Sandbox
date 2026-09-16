#pragma once
#include <cctype>
#include <cstdlib>
#include <string>
#include <vector>
#include <cmath>
#include <stdexcept>
// Value, first derivative and second derivative with respect to simulation time.
struct Jet { double v=0,d=0,dd=0; };
inline Jet mul(Jet a,Jet b){return{a.v*b.v,a.d*b.v+a.v*b.d,a.dd*b.v+2*a.d*b.d+a.v*b.dd};}
inline Jet chain(Jet a,double f,double df,double ddf){return{f,df*a.d,ddf*a.d*a.d+df*a.dd};}
class Expression {
  struct Node { std::string op; double number=0; int a=-1,b=-1; };
  std::vector<Node> nodes;
  std::string source;
  size_t pos=0;
  void space(){while(pos<source.size()&&std::isspace((unsigned char)source[pos]))++pos;}
  bool take(char c){space();if(pos<source.size()&&source[pos]==c){++pos;return true;}return false;}
  int add(Node n){if(nodes.size()>=128)throw std::runtime_error("Formula too complex");nodes.push_back(n);return (int)nodes.size()-1;}
  int sum(){int a=product();for(;;){if(take('+'))a=add({"+",0,a,product()});else if(take('-'))a=add({"-",0,a,product()});else return a;}}
  int product(){int a=unary();for(;;){if(take('*'))a=add({"*",0,a,unary()});else if(take('/'))a=add({"/",0,a,unary()});else return a;}}
  int unary(){if(take('+'))return unary();if(take('-'))return add({"neg",0,unary()});int a=atom();if(take('^'))a=add({"^",0,a,unary()});return a;}
  int atom(){
    if(take('(')){int a=sum();if(!take(')'))throw std::runtime_error("Missing )");return a;}
    space();if(pos>=source.size())throw std::runtime_error("Incomplete formula");
    if(std::isdigit((unsigned char)source[pos])||source[pos]=='.'){char* end;double n=std::strtod(source.c_str()+pos,&end);if(end==source.c_str()+pos||!std::isfinite(n))throw std::runtime_error("Invalid number");pos=end-source.c_str();return add({"n",n});}
    size_t start=pos;while(pos<source.size()&&std::isalpha((unsigned char)source[pos]))++pos;std::string name=source.substr(start,pos-start);
    if(name=="t")return add({"t"});if(name=="pi")return add({"n",3.14159265358979323846});
    if(name!="sin"&&name!="cos"&&name!="exp"&&name!="log"&&name!="sqrt")throw std::runtime_error("Unknown symbol");
    if(!take('('))throw std::runtime_error("Expected (");int a=sum();if(!take(')'))throw std::runtime_error("Missing )");return add({name,0,a});
  }
  Jet eval(int i,double t)const{
    const auto& n=nodes[i];if(n.op=="n")return{n.number};if(n.op=="t")return{t,1,0};Jet a=eval(n.a,t),b=n.b>=0?eval(n.b,t):Jet{};
    if(n.op=="+")return{a.v+b.v,a.d+b.d,a.dd+b.dd};if(n.op=="-")return{a.v-b.v,a.d-b.d,a.dd-b.dd};if(n.op=="neg")return{-a.v,-a.d,-a.dd};if(n.op=="*")return mul(a,b);
    if(n.op=="/")return mul(a,chain(b,1/b.v,-1/(b.v*b.v),2/(b.v*b.v*b.v)));
    if(n.op=="sin")return chain(a,std::sin(a.v),std::cos(a.v),-std::sin(a.v));if(n.op=="cos")return chain(a,std::cos(a.v),-std::sin(a.v),-std::cos(a.v));
    if(n.op=="exp"){double e=std::exp(a.v);return chain(a,e,e,e);}if(n.op=="log")return chain(a,std::log(a.v),1/a.v,-1/(a.v*a.v));if(n.op=="sqrt"){double r=std::sqrt(a.v);return chain(a,r,.5/r,-.25/(r*r*r));}
    if(b.d==0&&b.dd==0){if(b.v==0)return{1};if(b.v==1)return a;double p=std::pow(a.v,b.v);return chain(a,p,b.v*std::pow(a.v,b.v-1),b.v*(b.v-1)*std::pow(a.v,b.v-2));}
    Jet l=chain(a,std::log(a.v),1/a.v,-1/(a.v*a.v)),z=mul(b,l);double e=std::exp(z.v);return chain(z,e,e,e);
  }
public:
  void compile(const std::string& text){source=text;pos=0;nodes.clear();if(text.empty()||text.size()>255)throw std::runtime_error("Formula length");sum();space();if(pos!=source.size())throw std::runtime_error("Unexpected character");}
  Jet at(double t)const {Jet j=eval((int)nodes.size()-1,t);if(!std::isfinite(j.v)||!std::isfinite(j.d)||!std::isfinite(j.dd))throw std::runtime_error("Formula domain error");return j;}
};
