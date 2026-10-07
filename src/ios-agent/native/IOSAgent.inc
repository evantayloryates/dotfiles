// Personal app-owned developer agent. Include once in AppDelegate.mm.
// Explicit opt-in plus Debug; Release contains no SDK, private APIs or network agent.
#if DEBUG && defined(IOS_AGENT_ENABLED) && IOS_AGENT_ENABLED
#import <UIKit/UIKit.h>
#import <QuartzCore/QuartzCore.h>
#if __has_include(<React/RCTEventEmitter.h>)
#define IOS_AGENT_REACT 1
#import <React/RCTEventEmitter.h>
#import <React/RCTBridgeModule.h>
#endif
#import "TouchHID.inc"

@interface UITouch (IOSAgentPrivate)
- (void)setWindow:(UIWindow*)window;
- (void)setView:(UIView*)view;
- (void)setTapCount:(NSUInteger)count;
- (void)setTimestamp:(NSTimeInterval)time;
- (void)setPhase:(UITouchPhase)phase;
- (void)setGestureView:(UIView*)view;
- (void)_setLocationInWindow:(CGPoint)point resetPrevious:(BOOL)reset;
- (void)_setIsFirstTouchForView:(BOOL)first;
- (void)_setHidEvent:(IOHIDEventRef)event;
@end
@interface UIEvent (IOSAgentPrivate)
- (void)_clearTouches;
- (void)_setHIDEvent:(IOHIDEventRef)event;
- (void)_addTouch:(UITouch*)touch forDelayedDelivery:(BOOL)delayed;
@end
@interface UIApplication (IOSAgentPrivate)
- (UIEvent*)_touchesEvent;
@end

static NSTimeInterval IANow(void) { return NSProcessInfo.processInfo.systemUptime; }
static NSDictionary *IAError(NSString *reason) { return @{@"error":reason}; }
static BOOL IANumber(id n) { return [n isKindOfClass:NSNumber.class] && isfinite([n doubleValue]); }

@interface IAGlowWindow : UIWindow
@end
@implementation IAGlowWindow
- (UIView*)hitTest:(CGPoint)p withEvent:(UIEvent*)e { return nil; }
@end

@interface IOSAgent : NSObject<NSURLSessionTaskDelegate>
@property NSDictionary *config;
@property NSString *boot;
@property NSString *epoch;
@property NSString *lease;
@property NSTimeInterval expiry;
@property NSURLSession *session;
@property NSTimer *watchdog;
@property IAGlowWindow *glow;
@property NSMapTable<NSString*,UIView*> *nodes;
@property NSString *snapshot;
@property NSTimeInterval snapshotAt;
@property BOOL treeTruncated;
@property NSMutableDictionary<NSString*,NSValue*> *nodeRects;
@property NSMutableArray<NSString*> *seen;
@property UITouch *touch;
@property NSMutableArray *reactFrames;
@property NSUInteger reactBytes;
@property NSUInteger droppedReactFrames;
@property NSDictionary *appState;
@property BOOL running;
@property BOOL helloNeeded;
@property NSUInteger connectionGeneration;
- (void)poll;
- (BOOL)leased;
- (void)startWatchdog;
- (void)stopLease;
- (void)execute:(NSDictionary*)command completion:(void(^)(NSDictionary*))done;
- (void)exchange:(NSDictionary*)extra completion:(void(^)(NSDictionary*))done;
@end
static IOSAgent *IAInstance;
static NSDictionary *IAPendingState;

#if IOS_AGENT_REACT
@interface IOSAgentBridge : RCTEventEmitter<RCTBridgeModule>
@property BOOL observing;
@end
static __weak IOSAgentBridge *IABridge;
@implementation IOSAgentBridge
RCT_EXPORT_MODULE(IOSAgentBridge)
+ (BOOL)requiresMainQueueSetup { return YES; }
- (instancetype)init { if((self=[super init])) IABridge=self; return self; }
- (NSArray*)supportedEvents { return @[@"IOSAgentCommand"]; }
- (void)startObserving { self.observing=YES; if([IAInstance leased]) [self sendEventWithName:@"IOSAgentCommand" body:@{@"command":@"session-start"}]; }
- (void)stopObserving { self.observing=NO; }
- (dispatch_queue_t)methodQueue { return dispatch_get_main_queue(); }
RCT_EXPORT_METHOD(publish:(NSString*)json) {
 if(json.length>1048576) return;
 id value=[NSJSONSerialization JSONObjectWithData:[json dataUsingEncoding:NSUTF8StringEncoding] options:0 error:nil];
 if([value isKindOfClass:NSDictionary.class]) { IAPendingState=value; IAInstance.appState=value; }
}
RCT_EXPORT_METHOD(sendReact:(NSString*)json) {
 if(![IAInstance leased]) return;
 NSUInteger bytes=[json lengthOfBytesUsingEncoding:NSUTF8StringEncoding];
 if(bytes<=1048576 && IAInstance.reactFrames.count<128 && IAInstance.reactBytes+bytes<=4194304) {
  [IAInstance.reactFrames addObject:json]; IAInstance.reactBytes+=bytes;
 } else IAInstance.droppedReactFrames++;
}
@end
#endif

@implementation IOSAgent
- (void)startWatchdog {
 self.watchdog=[NSTimer timerWithTimeInterval:0.1 repeats:YES block:^(NSTimer *timer){ if(self.lease && ![self leased]) [self stopLease]; }];
 [NSRunLoop.mainRunLoop addTimer:self.watchdog forMode:NSRunLoopCommonModes];
}
- (void)URLSession:(NSURLSession*)session task:(NSURLSessionTask*)task willPerformHTTPRedirection:(NSHTTPURLResponse*)response newRequest:(NSURLRequest*)request completionHandler:(void(^)(NSURLRequest*))completion {
 completion(nil); // Never forward the enrollment credential to a redirect destination.
}
- (UIWindow*)mainWindow { return UIApplication.sharedApplication.delegate.window; }
- (BOOL)active { return UIApplication.sharedApplication.applicationState==UIApplicationStateActive && [self mainWindow] && ![self mainWindow].hidden; }
- (BOOL)leased { return self.lease && IANow()<self.expiry && [self active]; }
- (UIView*)frontHit:(CGPoint)point {
 UIWindow *main=[self mainWindow];
 NSArray *all=main.windowScene.windows;
 NSArray *windows=[all sortedArrayUsingComparator:^NSComparisonResult(UIWindow *a,UIWindow *b){
  if(a.windowLevel>b.windowLevel)return NSOrderedAscending; if(a.windowLevel<b.windowLevel)return NSOrderedDescending;
  return [all indexOfObject:a]>[all indexOfObject:b]?NSOrderedAscending:NSOrderedDescending;
 }];
 for(UIWindow *w in windows) {
  if(w==self.glow || w.hidden || w.alpha<=0.01)continue;
  UIView *hit=[w hitTest:[w convertPoint:point fromWindow:main] withEvent:nil];
  if(hit)return w==main?hit:nil; // A different app-owned window occludes the main-window target.
 }
 return main.windowScene?nil:[main hitTest:point withEvent:nil];
}
- (void)sendTouch {
 IOHIDEventRef hid=RunnerIOHIDEventWithTouches(@[self.touch]);
 if(!hid) @throw [NSException exceptionWithName:@"HIDUnavailable" reason:nil userInfo:nil];
 @try {
  [self.touch _setHidEvent:hid];
  UIEvent *event=[UIApplication.sharedApplication _touchesEvent];
  [event _clearTouches]; [event _setHIDEvent:hid]; [event _addTouch:self.touch forDelayedDelivery:NO];
  [UIApplication.sharedApplication sendEvent:event];
 } @finally { CFRelease(hid); }
}
- (NSDictionary*)capabilities {
 UITouch *touch=[UITouch new]; NSMutableDictionary *selectors=[NSMutableDictionary new]; BOOL input=YES;
 for(NSString *s in @[@"setWindow:",@"setView:",@"setTapCount:",@"setTimestamp:",@"setPhase:",@"_setLocationInWindow:resetPrevious:",@"_setHidEvent:"]) {
  BOOL available=[touch respondsToSelector:NSSelectorFromString(s)]; selectors[s]=@(available); input&=available;
 }
 UIEvent *event=nil;
 if([UIApplication.sharedApplication respondsToSelector:@selector(_touchesEvent)]) event=[UIApplication.sharedApplication _touchesEvent];
 for(NSString *s in @[@"_clearTouches",@"_setHIDEvent:",@"_addTouch:forDelayedDelivery:"]) input&=[event respondsToSelector:NSSelectorFromString(s)];
 return @{@"nativeInputRuntime":@(input),@"selectors":selectors,@"applicationState":@(UIApplication.sharedApplication.applicationState),
          @"imageScope":@"app-owned-main-window",@"inputMethod":@"in-process UIEvent",@"textMethod":@"UIKeyInput",@"xctest":@NO};
}
- (void)showGlow {
 if(!self.glow) {
  UIWindow *main=[self mainWindow];
  self.glow=main.windowScene?[[IAGlowWindow alloc] initWithWindowScene:main.windowScene]:[[IAGlowWindow alloc] initWithFrame:main.bounds];
  self.glow.frame=main.frame; self.glow.windowLevel=UIWindowLevelNormal+5;
  self.glow.backgroundColor=UIColor.clearColor; self.glow.userInteractionEnabled=NO; self.glow.accessibilityElementsHidden=YES;
  UIViewController *root=[UIViewController new]; root.view.backgroundColor=UIColor.clearColor; self.glow.rootViewController=root;
  CAGradientLayer *gradient=[CAGradientLayer layer]; gradient.frame=main.bounds;
  gradient.colors=@[(id)UIColor.systemBlueColor.CGColor,(id)UIColor.systemPurpleColor.CGColor,(id)UIColor.systemPinkColor.CGColor,(id)UIColor.systemOrangeColor.CGColor];
  gradient.startPoint=CGPointMake(0,0); gradient.endPoint=CGPointMake(1,1);
  CAShapeLayer *mask=[CAShapeLayer layer]; mask.path=[UIBezierPath bezierPathWithRoundedRect:CGRectInset(main.bounds,3,3) cornerRadius:43].CGPath;
  mask.lineWidth=5; mask.strokeColor=UIColor.whiteColor.CGColor; mask.fillColor=UIColor.clearColor.CGColor; gradient.mask=mask;
  [root.view.layer addSublayer:gradient];
  CABasicAnimation *pulse=[CABasicAnimation animationWithKeyPath:@"opacity"]; pulse.fromValue=@1; pulse.toValue=@0.65; pulse.duration=2; pulse.autoreverses=YES; pulse.repeatCount=HUGE_VALF;
  [gradient addAnimation:pulse forKey:@"agent-pulse"];
 }
 self.glow.hidden=NO;
}
- (void)stopLease {
 BOOL wasLeased=self.lease!=nil;
 self.lease=nil; self.expiry=0; self.glow.hidden=YES; self.snapshot=nil;
 [self.reactFrames removeAllObjects]; self.reactBytes=0; self.droppedReactFrames=0;
#if IOS_AGENT_REACT
 if(wasLeased && IABridge.observing) [IABridge sendEventWithName:@"IOSAgentCommand" body:@{@"command":@"session-end"}];
#endif
 if(self.touch) {
  @try { [self.touch setPhase:UITouchPhaseCancelled]; [self.touch setTimestamp:IANow()]; [self sendTouch]; } @catch(NSException *e) {}
  self.touch=nil;
 }
}
- (void)background:(NSNotification*)n {
 self.connectionGeneration++;
 NSString *lease=[self.lease copy], *epoch=[self.epoch copy]; [self stopLease];
 if(lease && epoch) [self exchange:@{@"op":@"cancel",@"lease":lease,@"epoch":epoch} completion:^(NSDictionary *reply){}];
}
- (void)apply:(NSDictionary*)reply {
 NSString *epoch=reply[@"epoch"];
 if(![epoch isKindOfClass:NSString.class]) { [self stopLease]; return; }
 if(self.epoch && ![self.epoch isEqual:epoch]) [self stopLease];
 self.epoch=epoch;
 NSDictionary *lease=reply[@"lease"];
 if(![lease isKindOfClass:NSDictionary.class] || ![lease[@"id"] isKindOfClass:NSString.class] || !IANumber(lease[@"remainingMs"]) || ![self active]) { [self stopLease]; return; }
 if(self.lease && ![self.lease isEqual:lease[@"id"]]) [self stopLease];
 BOOL starting=self.lease==nil;
 self.lease=lease[@"id"]; self.expiry=IANow()+MAX(0,MIN(30000,[lease[@"remainingMs"] doubleValue]))/1000;
#if IOS_AGENT_REACT
 if(starting && IABridge.observing) [IABridge sendEventWithName:@"IOSAgentCommand" body:@{@"command":@"session-start"}];
#endif
 if([self leased]) [self showGlow]; else [self stopLease];
}
- (void)walk:(UIView*)view depth:(NSUInteger)depth output:(NSMutableArray*)out {
 if(out.count>=2500 || depth>60) { self.treeTruncated=YES; return; }
 NSString *node=[NSString stringWithFormat:@"%lu",(unsigned long)out.count]; [self.nodes setObject:view forKey:node];
 CGRect r=[view convertRect:view.bounds toView:nil];
 self.nodeRects[node]=[NSValue valueWithCGRect:r];
 BOOL visible=!view.hidden && view.alpha>0.01 && !CGRectIsEmpty(CGRectIntersection(r,[self mainWindow].bounds));
 CGFloat alpha=view.alpha; CGRect visibleRect=r;
 for(UIView *ancestor=view.superview;ancestor;ancestor=ancestor.superview) {
  alpha*=ancestor.alpha; if(ancestor.hidden)visible=NO;
  if(ancestor.clipsToBounds)visibleRect=CGRectIntersection(visibleRect,[ancestor convertRect:ancestor.bounds toView:nil]);
 }
 visible=visible&&alpha>0.01&&!CGRectIsEmpty(visibleRect);
 [out addObject:@{@"node":node,@"class":NSStringFromClass(view.class),@"depth":@(depth),
                 @"label":view.accessibilityLabel?:@"",@"identifier":view.accessibilityIdentifier?:@"",
                 @"rect":@[@(r.origin.x),@(r.origin.y),@(r.size.width),@(r.size.height)],
                 @"visible":@(visible),@"interactive":@(view.userInteractionEnabled),@"firstResponder":@(view.isFirstResponder)}];
 for(UIView *sub in view.subviews) [self walk:sub depth:depth+1 output:out];
}
- (UIView*)responder:(UIView*)view { if(view.isFirstResponder)return view; for(UIView *v in view.subviews){UIView *found=[self responder:v]; if(found)return found;} return nil; }
- (void)execute:(NSDictionary*)c completion:(void(^)(NSDictionary*))done {
 if(![self leased] || ![c[@"lease"] isEqual:self.lease] || ![c[@"epoch"] isEqual:self.epoch] || !IANumber(c[@"remainingMs"]) || [c[@"remainingMs"] doubleValue]<=0) { done(IAError(@"lease_or_command_expired")); return; }
 NSString *cid=c[@"id"], *action=c[@"action"]; NSDictionary *args=c[@"args"];
 if(![cid isKindOfClass:NSString.class] || ![args isKindOfClass:NSDictionary.class]) { done(IAError(@"invalid_command")); return; }
 if([self.seen containsObject:cid]) { done(IAError(@"duplicate_command")); return; }
 [self.seen addObject:cid]; if(self.seen.count>256) [self.seen removeObjectAtIndex:0];
 @try {
  if([action isEqual:@"capabilities"]) { done([self capabilities]); return; }
  if([action isEqual:@"state"]) { done(self.appState?:@{@"ready":@NO}); return; }
  if([action isEqual:@"react"]) {
#if IOS_AGENT_REACT
   NSString *message=args[@"message"];
   if(message) {
    if(![message isKindOfClass:NSString.class] || message.length>1048576 || !IABridge.observing) { done(IAError(@"react_not_ready")); return; }
    [IABridge sendEventWithName:@"IOSAgentCommand" body:@{@"command":@"react",@"message":message}];
   }
   NSArray *frames=[self.reactFrames copy]; [self.reactFrames removeAllObjects]; self.reactBytes=0;
   NSUInteger dropped=self.droppedReactFrames; self.droppedReactFrames=0;
   done(@{@"frames":frames,@"droppedFrames":@(dropped),@"delivery":@"queued-to-js"}); return;
#else
   done(IAError(@"react_not_compiled")); return;
#endif
  }
  if([action isEqual:@"tree"]) {
   self.nodes=[NSMapTable strongToWeakObjectsMapTable]; self.nodeRects=[NSMutableDictionary new]; self.snapshot=NSUUID.UUID.UUIDString; self.snapshotAt=IANow(); self.treeTruncated=NO;
   NSMutableArray *tree=[NSMutableArray new]; [self walk:[self mainWindow] depth:0 output:tree];
   done(@{@"snapshot":self.snapshot,@"nodes":tree,@"applicationState":@(UIApplication.sharedApplication.applicationState),@"scope":@"app-owned-main-window",@"truncated":@(self.treeTruncated)}); return;
  }
  if([action isEqual:@"image"]) {
   UIWindow *main=[self mainWindow]; UIGraphicsImageRenderer *renderer=[[UIGraphicsImageRenderer alloc] initWithSize:main.bounds.size];
   UIImage *image=[renderer imageWithActions:^(UIGraphicsImageRendererContext *context){[main drawViewHierarchyInRect:main.bounds afterScreenUpdates:NO];}];
   NSData *png=UIImagePNGRepresentation(image);
   if(png.length>5242880) { done(IAError(@"image_exceeds_limit")); return; }
   done(@{@"scope":@"app-owned-main-window",@"systemOcclusionKnown":@NO,@"glowIncluded":@NO,@"pngBase64":[png base64EncodedStringWithOptions:0]}); return;
  }
  if([action isEqual:@"text"]) {
   UIView *first=[self responder:[self mainWindow]]; NSString *text=args[@"text"];
   if(![text isKindOfClass:NSString.class] || text.length>4096 || ![first conformsToProtocol:@protocol(UIKeyInput)]) { done(IAError(@"focused_text_input_required")); return; }
   [(id<UIKeyInput>)first insertText:text]; done(@{@"delivered":@YES,@"method":@"UIKeyInput",@"commitVerified":@NO}); return;
  }
  if(![action isEqual:@"tap"] && ![action isEqual:@"gesture"]) { done(IAError(@"unsupported_action")); return; }
  if(![[self capabilities][@"nativeInputRuntime"] boolValue]) { done(IAError(@"native_input_unavailable")); return; }
  if(!self.snapshot || IANow()-self.snapshotAt>5 || ![args[@"snapshot"] isEqual:self.snapshot] || !IANumber(args[@"x"]) || !IANumber(args[@"y"])) { done(IAError(@"fresh_snapshot_and_point_required")); return; }
  CGPoint point=CGPointMake([args[@"x"] doubleValue],[args[@"y"] doubleValue]); UIWindow *window=[self mainWindow];
  if(!CGRectContainsPoint(window.bounds,point)) { done(IAError(@"outside_app")); return; }
  UIView *expected=[self.nodes objectForKey:args[@"target"]], *hit=[self frontHit:point];
  if(expected && !CGRectEqualToRect([expected convertRect:expected.bounds toView:nil],[self.nodeRects[args[@"target"]] CGRectValue])) { done(IAError(@"target_geometry_changed")); return; }
  if(!expected || !hit || !(hit==expected || [hit isDescendantOfView:expected])) { done(IAError(@"hit_target_changed_or_occluded")); return; }
  if(self.touch) { done(IAError(@"input_in_flight")); return; }
  CGPoint end=point; double duration=0.08;
  if([action isEqual:@"gesture"]) {
   if(!IANumber(args[@"endX"]) || !IANumber(args[@"endY"]) || !IANumber(args[@"durationMs"])) { done(IAError(@"gesture_arguments_required")); return; }
   end=CGPointMake([args[@"endX"] doubleValue],[args[@"endY"] doubleValue]); duration=[args[@"durationMs"] doubleValue]/1000;
   if(!CGRectContainsPoint(window.bounds,end) || duration<0.05 || duration>5) { done(IAError(@"invalid_gesture")); return; }
  }
  NSTimeInterval deadline=IANow()+MIN([c[@"remainingMs"] doubleValue]/1000, duration+1);
  self.touch=[UITouch new]; [self.touch setWindow:window]; [self.touch setTapCount:1]; [self.touch _setLocationInWindow:point resetPrevious:YES]; [self.touch setView:hit];
  if([self.touch respondsToSelector:@selector(setGestureView:)]) [self.touch setGestureView:hit];
  if([self.touch respondsToSelector:@selector(_setIsFirstTouchForView:)]) [self.touch _setIsFirstTouchForView:YES];
  [self.touch setTimestamp:IANow()]; [self.touch setPhase:UITouchPhaseBegan]; [self sendTouch];
  NSUInteger steps=MAX(1,(NSUInteger)ceil(duration*60)); NSString *lease=[self.lease copy];
  // Run-loop delivery preserves recognizer timing; no direct handler calls.
  for(NSUInteger i=1;i<=steps;i++) {
   dispatch_after(dispatch_time(DISPATCH_TIME_NOW,(int64_t)(duration*i/steps*NSEC_PER_SEC)),dispatch_get_main_queue(),^{
    if(!self.touch || ![self leased] || ![self.lease isEqual:lease] || IANow()>deadline) {
     if(i==steps) done(IAError(@"input_cancelled_or_expired"));
     if([self.lease isEqual:lease]) [self stopLease]; return;
    }
    @try {
     CGFloat t=(CGFloat)i/steps; CGPoint position=CGPointMake(point.x+(end.x-point.x)*t,point.y+(end.y-point.y)*t);
     [self.touch _setLocationInWindow:position resetPrevious:NO]; [self.touch setTimestamp:IANow()];
     [self.touch setPhase:i==steps?UITouchPhaseEnded:UITouchPhaseMoved]; [self sendTouch];
     if(i==steps) { self.touch=nil; done(@{@"delivered":@YES,@"method":@"in-process UIEvent",@"hitClass":NSStringFromClass(hit.class),@"commitVerified":@NO}); }
    } @catch(NSException *e) { [self stopLease]; if(i==steps) done(IAError(@"private_api_exception")); }
   });
  }
 } @catch(NSException *e) { [self stopLease]; done(IAError(@"private_api_exception")); }
}
- (void)exchange:(NSDictionary*)extra completion:(void(^)(NSDictionary*))done {
 NSUInteger generation=self.connectionGeneration;
 NSMutableDictionary *body=[@{@"device":self.config[@"device"],@"bundle":NSBundle.mainBundle.bundleIdentifier,@"boot":self.boot,
                             @"build":[NSBundle.mainBundle objectForInfoDictionaryKey:@"CFBundleVersion"]?:@"unknown",
                             @"feedback":@{@"foreground":@([self active]),@"indicator":@(self.glow&&!self.glow.hidden),@"leased":@([self leased])}} mutableCopy]; [body addEntriesFromDictionary:extra];
 NSMutableURLRequest *request=[NSMutableURLRequest requestWithURL:[NSURL URLWithString:self.config[@"endpoint"]]];
 request.HTTPMethod=@"POST"; request.timeoutInterval=8;
 [request setValue:[@"Bearer " stringByAppendingString:self.config[@"token"]] forHTTPHeaderField:@"Authorization"];
 [request setValue:@"application/json" forHTTPHeaderField:@"Content-Type"];
 request.HTTPBody=[NSJSONSerialization dataWithJSONObject:body options:0 error:nil];
 [[self.session dataTaskWithRequest:request completionHandler:^(NSData *data,NSURLResponse *response,NSError *error){
  NSDictionary *reply=nil;
  if(!error && [(NSHTTPURLResponse*)response statusCode]==200 && data.length<=8388608) {
   id parsed=[NSJSONSerialization JSONObjectWithData:data options:0 error:nil]; if([parsed isKindOfClass:NSDictionary.class]) reply=parsed;
  }
  dispatch_async(dispatch_get_main_queue(),^{done(generation==self.connectionGeneration?reply:nil);});
 }] resume];
}
- (void)poll {
 if(!self.running) return;
 if(![self active]) { [self stopLease]; dispatch_after(dispatch_time(DISPATCH_TIME_NOW,NSEC_PER_SEC),dispatch_get_main_queue(),^{[self poll];}); return; }
 [self exchange:@{@"op":self.helloNeeded?@"hello":@"next"} completion:^(NSDictionary *reply){
  if(!reply) { self.helloNeeded=YES; dispatch_after(dispatch_time(DISPATCH_TIME_NOW,NSEC_PER_SEC),dispatch_get_main_queue(),^{[self poll];}); return; }
  self.helloNeeded=NO; [self apply:reply];
  NSDictionary *command=reply[@"command"];
  if(![command isKindOfClass:NSDictionary.class]) { [self poll]; return; }
  [self execute:command completion:^(NSDictionary *result){
   [self exchange:@{@"op":@"result",@"id":command[@"id"],@"epoch":command[@"epoch"],@"result":result} completion:^(NSDictionary *ack){
    if(ack) [self apply:ack]; else self.helloNeeded=YES; [self poll];
   }];
  }];
 }];
}
@end

static void IOSAgentStart(void) {
 if(IAInstance || ![NSBundle.mainBundle.bundleIdentifier isEqual:@"com.dev.kudos.fit"]) return;
 NSURL *documents=[NSFileManager.defaultManager URLsForDirectory:NSDocumentDirectory inDomains:NSUserDomainMask].firstObject;
 NSURL *path=[documents URLByAppendingPathComponent:@"ios-agent.json"];
 NSData *data=[NSData dataWithContentsOfURL:path]; if(!data || data.length>8192) return;
 [path setResourceValue:@YES forKey:NSURLIsExcludedFromBackupKey error:nil];
 id parsed=[NSJSONSerialization JSONObjectWithData:data options:0 error:nil]; if(![parsed isKindOfClass:NSDictionary.class]) return;
 NSDictionary *config=parsed; NSURL *endpoint=[NSURL URLWithString:config[@"endpoint"]];
 if(![endpoint.scheme isEqual:@"https"] || ![endpoint.host hasSuffix:@".ts.net"] || ![endpoint.path isEqual:@"/v1/device"] || ![config[@"token"] isKindOfClass:NSString.class] || [config[@"token"] length]<32 || ![config[@"device"] isKindOfClass:NSString.class]) return;
 IAInstance=[IOSAgent new]; IAInstance.config=config; IAInstance.boot=NSUUID.UUID.UUIDString;
 IAInstance.appState=IAPendingState;
 IAInstance.seen=[NSMutableArray new]; IAInstance.reactFrames=[NSMutableArray new]; IAInstance.helloNeeded=YES; IAInstance.running=YES;
 NSURLSessionConfiguration *network=[NSURLSessionConfiguration ephemeralSessionConfiguration]; network.HTTPCookieStorage=nil; network.URLCache=nil;
 IAInstance.session=[NSURLSession sessionWithConfiguration:network delegate:IAInstance delegateQueue:nil];
 [[NSNotificationCenter defaultCenter] addObserver:IAInstance selector:@selector(background:) name:UIApplicationWillResignActiveNotification object:nil];
 [IAInstance startWatchdog];
 [IAInstance poll];
}
#endif
