// DEV-only, fixed loopback reachability. No caller host/port, bytes or credentials.
#import <sys/socket.h>
#import <sys/select.h>
#import <arpa/inet.h>
#import <fcntl.h>
#import <unistd.h>
#import <errno.h>

static NSString *IADeveloperLoopbackTCP(int family) {
 int fd=socket(family,SOCK_STREAM,0);
 if(fd>=FD_SETSIZE) { close(fd); return @"unavailable"; }
 if(fd<0) return @"unavailable";
 int flags=fcntl(fd,F_GETFL,0);
 if(flags<0 || fcntl(fd,F_SETFL,flags|O_NONBLOCK)<0) { close(fd); return @"unavailable"; }
 int status;
 if(family==AF_INET) {
  struct sockaddr_in address={0}; address.sin_len=sizeof(address); address.sin_family=AF_INET;
  address.sin_port=htons(49152); inet_pton(AF_INET,"127.0.0.1",&address.sin_addr);
  status=connect(fd,(struct sockaddr*)&address,sizeof(address));
 } else {
  struct sockaddr_in6 address={0}; address.sin6_len=sizeof(address); address.sin6_family=AF_INET6;
  address.sin6_port=htons(49152); inet_pton(AF_INET6,"::1",&address.sin6_addr);
  status=connect(fd,(struct sockaddr*)&address,sizeof(address));
 }
 int error=status==0?0:errno;
 if(status<0 && error==EINPROGRESS) {
  fd_set writable; FD_ZERO(&writable); FD_SET(fd,&writable);
  struct timeval deadline={.tv_sec=0,.tv_usec=500000};
  int ready=select(fd+1,NULL,&writable,NULL,&deadline);
  if(ready==0) { close(fd); return @"timeout"; }
  socklen_t length=sizeof(error);
  if(ready<0 || getsockopt(fd,SOL_SOCKET,SO_ERROR,&error,&length)<0) { close(fd); return @"unavailable"; }
 }
 close(fd);
 return error==0?@"accepted":error==ECONNREFUSED?@"refused":@"unavailable";
}

static void IOSAgentDeveloperProbe(void(^done)(NSDictionary*)) {
 dispatch_async(dispatch_get_global_queue(QOS_CLASS_UTILITY,0),^{
  NSString *ipv4=IADeveloperLoopbackTCP(AF_INET),*ipv6=IADeveloperLoopbackTCP(AF_INET6);
  dispatch_async(dispatch_get_main_queue(),^{
   done(@{@"scope":@"fixed-phone-loopback-developer-endpoint",@"port":@49152,
          @"ipv4":ipv4,@"ipv6":ipv6,@"deadlineMsPerAddress":@500,
          @"authenticationAttempted":@NO,@"developerChannelVerified":@NO});
  });
 });
}
