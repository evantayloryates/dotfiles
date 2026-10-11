// Experimental foreground-only pairing probe. Fixed phone loopback49152;
// authenticated existing HTTPS broker, one stream,60sec/4MiB, no payload logs.
#include <atomic>
static std::atomic_bool IARelayRunning(false);
static std::atomic_uint IARelayGeneration(0);
static void IOSAgentRelayStop(void) { IARelayGeneration.fetch_add(1); IARelayRunning.store(false); }
static NSDictionary *IOSAgentRelayStart(void(^exchange)(NSDictionary*,void(^)(NSDictionary*)),NSString *lease,NSString *epoch) {
 if(IARelayRunning.exchange(true))return IAError(@"relay_already_running_no_replay");
 unsigned generation=IARelayGeneration.fetch_add(1)+1;
 dispatch_async(dispatch_get_global_queue(QOS_CLASS_UTILITY,0),^{
  int fd=socket(AF_INET,SOCK_STREAM,0), yes=1;
  if(fd<0 || fd>=FD_SETSIZE) { if(fd>=0)close(fd); if(generation==IARelayGeneration.load())IARelayRunning.store(false); return; }
  setsockopt(fd,SOL_SOCKET,SO_NOSIGPIPE,&yes,sizeof(yes));
  fcntl(fd,F_SETFL,fcntl(fd,F_GETFL,0)|O_NONBLOCK);
  struct sockaddr_in address={0};address.sin_len=sizeof(address);address.sin_family=AF_INET;address.sin_port=htons(49152);inet_pton(AF_INET,"127.0.0.1",&address.sin_addr);
  int connected=connect(fd,(struct sockaddr*)&address,sizeof(address));
  if(connected<0 && errno==EINPROGRESS) {
   fd_set writable;FD_ZERO(&writable);FD_SET(fd,&writable);struct timeval timeout={.tv_sec=1,.tv_usec=0};
   int error=0;socklen_t length=sizeof(error);
   connected=select(fd+1,NULL,&writable,NULL,&timeout)>0 && getsockopt(fd,SOL_SOCKET,SO_ERROR,&error,&length)==0 && error==0?0:-1;
  }
  NSTimeInterval deadline=IANow()+60;NSUInteger total=0,sequence=0;NSMutableData *pending=[NSMutableData new];
  while(connected==0 && IARelayRunning.load() && generation==IARelayGeneration.load() && IANow()<deadline && total<4194304) {
   if(pending.length) {
    ssize_t sent=send(fd,pending.bytes,pending.length,0);
    if(sent>0)[pending replaceBytesInRange:NSMakeRange(0,sent) withBytes:NULL length:0];
    else if(sent<0 && errno!=EAGAIN && errno!=EWOULDBLOCK)break;
   }
   uint8_t bytes[16384];ssize_t count=recv(fd,bytes,sizeof(bytes),0);
   if(count==0 || (count<0 && errno!=EAGAIN && errno!=EWOULDBLOCK))break;
   NSData *data=count>0?[NSData dataWithBytes:bytes length:count]:[NSData data];total+=data.length;
   dispatch_semaphore_t ready=dispatch_semaphore_create(0);__block NSDictionary *reply=nil;
   NSDictionary *frame=@{@"op":@"developer_relay",@"lease":lease,@"epoch":epoch,@"sequence":@(sequence),@"data":[data base64EncodedStringWithOptions:0]};
   dispatch_async(dispatch_get_main_queue(),^{
    if(generation!=IARelayGeneration.load()) { dispatch_semaphore_signal(ready);return; }
    exchange(frame,^(NSDictionary *result){reply=result;dispatch_semaphore_signal(ready);});
   });
   if(dispatch_semaphore_wait(ready,dispatch_time(DISPATCH_TIME_NOW,4*NSEC_PER_SEC))!=0)break;
   NSDictionary *response=reply[@"relay"];
   if(![response isKindOfClass:NSDictionary.class] || ![response[@"sequence"] isEqual:@(sequence)] || [response[@"closed"] boolValue] || ![response[@"data"] isKindOfClass:NSString.class] || [response[@"data"] length]>22000)break;
   NSData *incoming=[[NSData alloc] initWithBase64EncodedString:response[@"data"] options:0];
   if(!incoming || incoming.length>16384 || pending.length+incoming.length>262144)break;
   [pending appendData:incoming];total+=incoming.length;sequence++;usleep(50000);
  }
  close(fd);if(generation==IARelayGeneration.load())IARelayRunning.store(false);
 });
 return @{@"scope":@"foreground-fixed-loopback-pairing-candidate",@"started":@YES,@"port":@49152,@"deadlineSeconds":@60,@"pairingVerified":@NO,@"payloadLogged":@NO};
}
