// IEEE 1516e host adapter; no replacement RTI or synthetic callback engine.
#include <memory>
#include <RTI/RTIambassador.h>
#include <RTI/RTIambassadorFactory.h>
#include <RTI/NullFederateAmbassador.h>
#include <RTI/time/HLAfloat64Time.h>
#include <RTI/time/HLAfloat64Interval.h>
#include <iostream>
#include <sstream>
#include <map>
#include <memory>
#include <vector>
#include <iomanip>
#include <cmath>
#include <codecvt>
#include <locale>
using namespace rti1516e;

static std::vector<std::string> events;
static std::wstring wide(const std::string& s) {
  for (unsigned char c : s) if (c < 33 || c > 126) throw std::runtime_error("host tokens must be printable ASCII without spaces");
  return std::wstring(s.begin(), s.end());
}
static std::string json(const std::string& s) {
  std::ostringstream o; o << '"';
  for (unsigned char c : s) {
    if (c == '"' || c == '\\') o << '\\' << c;
    else if (c < 32) o << "\\u" << std::hex << std::setw(4) << std::setfill('0') << int(c);
    else o << c;
  }
  return o.str() + '"';
}
static std::string narrow(const std::wstring& s) {
  return std::wstring_convert<std::codecvt_utf8<wchar_t>>().to_bytes(s);
}
static std::string hex(const VariableLengthData& data) {
  std::ostringstream o;
  const auto* p = static_cast<const unsigned char*>(data.data());
  for (size_t i = 0; i < data.size(); ++i) o << std::hex << std::setw(2) << std::setfill('0') << unsigned(p[i]);
  return o.str();
}
static std::vector<unsigned char> unhex(const std::string& text) {
  if (text == "-") return {};
  if (text.size() % 2 || text.size() > 262144) throw std::runtime_error("invalid hex payload size");
  std::vector<unsigned char> out;
  for (size_t i=0; i<text.size(); i+=2) {
    auto digit=[](char c)->int { if(c>='0'&&c<='9')return c-'0'; if(c>='a'&&c<='f')return c-'a'+10; if(c>='A'&&c<='F')return c-'A'+10; throw std::runtime_error("invalid hex digit"); };
    out.push_back((digit(text[i])<<4)|digit(text[i+1]));
  }
  return out;
}
static double number(const std::string& s) {
  size_t end; double d=std::stod(s,&end);
  if(end!=s.size()||!std::isfinite(d)||d<0)throw std::runtime_error("time must be finite and nonnegative");
  return d;
}
static std::string timeJSON(const LogicalTime& time) {
  auto* value=dynamic_cast<const HLAfloat64Time*>(&time);
  if (!value) throw std::runtime_error("host requires HLAfloat64Time");
  std::ostringstream o; o << std::setprecision(17) << value->getTime(); return o.str();
}

struct Session : NullFederateAmbassador {
  std::string id;
  std::unique_ptr<RTIambassador> rti;
  bool joined=false, connected=false, owns=false;
  std::wstring federation;
  std::map<std::string,ObjectInstanceHandle> objects;
  explicit Session(std::string name):id(std::move(name)),rti(RTIambassadorFactory().createRTIambassador()){}
  void event(const std::string& type,const std::string& fields="") {
    events.push_back("{\"session\":"+json(id)+",\"type\":"+json(type)+fields+"}");
  }
  void timeRegulationEnabled(const LogicalTime& t) override {event("time-regulation-enabled",",\"time\":"+timeJSON(t));}
  void timeConstrainedEnabled(const LogicalTime& t) override {event("time-constrained-enabled",",\"time\":"+timeJSON(t));}
  void timeAdvanceGrant(const LogicalTime& t) override {event("time-advance-grant",",\"time\":"+timeJSON(t));}
  void objectInstanceNameReservationSucceeded(const std::wstring& name) override {event("object-name-reserved",",\"name\":"+json(narrow(name)));}
  void objectInstanceNameReservationFailed(const std::wstring& name) override {event("object-name-refused",",\"name\":"+json(narrow(name)));}
  void discoverObjectInstance(ObjectInstanceHandle h,ObjectClassHandle,const std::wstring& name) override {
    objects[narrow(name)]=h; event("discover-object",",\"name\":"+json(narrow(name)));
  }
  void discoverObjectInstance(ObjectInstanceHandle h,ObjectClassHandle c,const std::wstring& n,FederateHandle) override {discoverObjectInstance(h,c,n);}
  template<class Map> void valuesEvent(const std::string& type,const Map& values,const LogicalTime* time=nullptr,const std::string& context="") {
    std::string fields=",\"valuesHex\":["; bool first=true;
    for(const auto& p:values){if(!first)fields+=",";first=false;fields+=json(hex(p.second));}
    fields+="],\"valueHandles\":[";first=true;
    for(const auto& p:values){if(!first)fields+=",";first=false;fields+=json(narrow(p.first.toString()));}
    fields+="]"+context; if(time)fields+=",\"time\":"+timeJSON(*time);event(type,fields);
  }
  void receiveInteraction(InteractionClassHandle h,const ParameterHandleValueMap& v,const VariableLengthData&,
                          OrderType,TransportationType,SupplementalReceiveInfo) override {valuesEvent("interaction",v,nullptr,",\"class\":"+json(narrow(rti->getInteractionClassName(h))));}
  void receiveInteraction(InteractionClassHandle h,const ParameterHandleValueMap& v,const VariableLengthData&,
                          OrderType,TransportationType,const LogicalTime& t,OrderType,SupplementalReceiveInfo) override {valuesEvent("interaction",v,&t,",\"class\":"+json(narrow(rti->getInteractionClassName(h))));}
  void receiveInteraction(InteractionClassHandle h,const ParameterHandleValueMap& v,const VariableLengthData& tag,
                          OrderType sent,TransportationType transport,const LogicalTime& t,OrderType received,
                          MessageRetractionHandle,SupplementalReceiveInfo info) override {receiveInteraction(h,v,tag,sent,transport,t,received,info);}
  void reflectAttributeValues(ObjectInstanceHandle h,const AttributeHandleValueMap& v,const VariableLengthData&,
                              OrderType,TransportationType,SupplementalReflectInfo) override {valuesEvent("reflection",v,nullptr,",\"object\":"+json(narrow(rti->getObjectInstanceName(h))));}
  void reflectAttributeValues(ObjectInstanceHandle h,const AttributeHandleValueMap& v,const VariableLengthData&,
                              OrderType,TransportationType,const LogicalTime& t,OrderType,SupplementalReflectInfo) override {valuesEvent("reflection",v,&t,",\"object\":"+json(narrow(rti->getObjectInstanceName(h))));}
  void reflectAttributeValues(ObjectInstanceHandle h,const AttributeHandleValueMap& v,const VariableLengthData& tag,
                              OrderType sent,TransportationType transport,const LogicalTime& t,OrderType received,
                              MessageRetractionHandle,SupplementalReflectInfo info) override {reflectAttributeValues(h,v,tag,sent,transport,t,received,info);}
  ~Session(){try{if(joined)rti->resignFederationExecution(CANCEL_THEN_DELETE_THEN_DIVEST);if(owns)rti->destroyFederationExecution(federation);if(connected)rti->disconnect();}catch(...) {}}
};

static void execute(Session& s,const std::vector<std::string>& a) {
  if(a.empty())throw std::runtime_error("missing command");
  auto arity=[&](size_t n){if(a.size()!=n)throw std::runtime_error("wrong command arity");};
  const auto& cmd=a[0]; auto& r=*s.rti;
  if(cmd=="connect") {arity(2);if(s.connected)throw std::runtime_error("already connected");r.connect(s,HLA_EVOKED,wide(a[1]));s.connected=true;}
  else if(cmd=="create") {arity(3);r.createFederationExecution(wide(a[1]),wide(a[2]),L"HLAfloat64Time");s.federation=wide(a[1]);s.owns=true;}
  else if(cmd=="join") {arity(3);r.joinFederationExecution(wide(a[1]),L"Mithril",wide(a[2]));s.federation=wide(a[2]);s.joined=true;}
  else if(cmd=="publish-interaction"||cmd=="subscribe-interaction") {arity(2);auto h=r.getInteractionClassHandle(wide(a[1]));if(cmd=="publish-interaction")r.publishInteractionClass(h);else r.subscribeInteractionClass(h);}
  else if(cmd=="send") {
    arity(5);auto h=r.getInteractionClassHandle(wide(a[1]));auto bytes=unhex(a[3]);
    ParameterHandleValueMap values;values[r.getParameterHandle(h,wide(a[2]))]=VariableLengthData(bytes.data(),bytes.size());
    if(a[4]=="ro")r.sendInteraction(h,values,VariableLengthData());
    else r.sendInteraction(h,values,VariableLengthData(),HLAfloat64Time(number(a[4])));
  }
  else if(cmd=="publish-object"||cmd=="subscribe-object") {
    if(a.size()<3)throw std::runtime_error("object publication requires attributes");
    auto h=r.getObjectClassHandle(wide(a[1]));AttributeHandleSet attrs;
    for(size_t i=2;i<a.size();++i)attrs.insert(r.getAttributeHandle(h,wide(a[i])));
    if(cmd=="publish-object")r.publishObjectClassAttributes(h,attrs);else r.subscribeObjectClassAttributes(h,attrs);
  }
  else if(cmd=="reserve") {arity(2);r.reserveObjectInstanceName(wide(a[1]));}
  else if(cmd=="register") {arity(3);s.objects[a[2]]=r.registerObjectInstance(r.getObjectClassHandle(wide(a[1])),wide(a[2]));}
  else if(cmd=="update") {
    arity(6);auto object=s.objects.at(a[1]);auto h=r.getObjectClassHandle(wide(a[2]));auto bytes=unhex(a[4]);
    AttributeHandleValueMap values;values[r.getAttributeHandle(h,wide(a[3]))]=VariableLengthData(bytes.data(),bytes.size());
    if(a[5]=="ro")r.updateAttributeValues(object,values,VariableLengthData());
    else r.updateAttributeValues(object,values,VariableLengthData(),HLAfloat64Time(number(a[5])));
  }
  else if(cmd=="regulate") {arity(2);double n=number(a[1]);if(n<=0)throw std::runtime_error("positive lookahead required");r.enableTimeRegulation(HLAfloat64Interval(n));}
  else if(cmd=="constrain") {arity(1);r.enableTimeConstrained();}
  else if(cmd=="advance") {arity(2);r.timeAdvanceRequest(HLAfloat64Time(number(a[1])));}
  else if(cmd=="evoke") {arity(1);r.evokeMultipleCallbacks(0.0,0.01);}
  else if(cmd=="resign") {arity(1);r.resignFederationExecution(CANCEL_THEN_DELETE_THEN_DIVEST);s.joined=false;}
  else if(cmd=="destroy") {arity(2);r.destroyFederationExecution(wide(a[1]));s.owns=false;}
  else if(cmd=="disconnect") {arity(1);r.disconnect();s.connected=false;}
  else throw std::runtime_error("unsupported host command");
}

int main() {
  std::map<std::string,std::unique_ptr<Session>> sessions;
  std::string line;
  while(std::getline(std::cin,line)) {
    events.clear();std::string error;
    try {
      if(line.size()>524288)throw std::runtime_error("host line limit exceeded");
      std::istringstream in(line);std::string id,token;in>>id;wide(id);
      if(id.empty())throw std::runtime_error("missing session identity");
      std::vector<std::string> args;while(in>>token){wide(token);args.push_back(token);}
      if(args.empty())throw std::runtime_error("missing command");
      if(!sessions.count(id)) {
        if(args[0]!="connect")throw std::runtime_error("unknown session");
        if(sessions.size()>=32)throw std::runtime_error("host session limit exceeded");
        sessions[id]=std::make_unique<Session>(id);
      }
      execute(*sessions.at(id),args);
      for(auto& pair:sessions)if(pair.second->joined)pair.second->rti->evokeMultipleCallbacks(0.0,0.01);
    } catch(const rti1516e::Exception& e){error=narrow(e.what());}
      catch(const std::exception& e){error=e.what();}
    std::cout<<"{\"ok\":"<<(error.empty()?"true":"false")<<",\"error\":"<<json(error)<<",\"events\":[";
    for(size_t i=0;i<events.size();++i){if(i)std::cout<<",";std::cout<<events[i];}
    std::cout<<"]}"<<std::endl;
  }
  // Resign every local member before destroying federations we created.
  // Never destroy a federation created by another host.
  for(auto& p:sessions)try{if(p.second->joined){p.second->rti->resignFederationExecution(CANCEL_THEN_DELETE_THEN_DIVEST);p.second->joined=false;}}catch(...){}
  for(auto& p:sessions)try{if(p.second->owns){p.second->rti->destroyFederationExecution(p.second->federation);p.second->owns=false;}}catch(...){}
  for(auto& p:sessions)try{if(p.second->connected){p.second->rti->disconnect();p.second->connected=false;}}catch(...){}
}
