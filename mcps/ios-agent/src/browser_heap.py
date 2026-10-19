"""Offline projections of an explicitly requested JavaScriptCore heap snapshot."""
import hashlib
import heapq
import json

MAX_HEAP_BYTES=32*1024*1024

def project_snapshot(text):
    if not isinstance(text,str) or len(text.encode())>MAX_HEAP_BYTES:
        raise ValueError('bounded_heap_snapshot_required')
    data=json.loads(text)
    if not isinstance(data,dict) or data.get('version')!=3 or data.get('type')!='Inspector':
        raise ValueError('supported_heap_snapshot_format_required')
    nodes=data.get('nodes');edges=data.get('edges');names=data.get('nodeClassNames');edge_names=data.get('edgeNames');edge_types=data.get('edgeTypes')
    if not all(isinstance(x,list) for x in [nodes,edges,names,edge_names,edge_types]) or len(nodes)%4 or len(edges)%4 or len(nodes)>2000000 or len(edges)>8000000 or not all(isinstance(n,str) for n in names+edge_names+edge_types):
        raise ValueError('supported_heap_snapshot_format_required')
    by_id={};classes={};total=0
    for i in range(0,len(nodes),4):
        ident,size,klass,flags=nodes[i:i+4]
        if not all(type(x) is int and x>=0 for x in [ident,size,klass,flags]) or klass>=len(names) or ident in by_id:raise ValueError('supported_heap_snapshot_format_required')
        by_id[ident]=(size,klass);total+=size
        row=classes.setdefault(klass,{'className':names[klass],'count':0,'shallowBytes':0});row['count']+=1;row['shallowBytes']+=size
    largest=heapq.nlargest(30,by_id,key=lambda ident:by_id[ident][0]);retainers={ident:[] for ident in largest}
    for i in range(0,len(edges),4):
        source,target,kind,extra=edges[i:i+4]
        if not all(type(x) is int and x>=0 for x in [source,target,kind,extra]) or source not in by_id or target not in by_id or kind>=len(edge_types):raise ValueError('supported_heap_snapshot_format_required')
        if edge_types[kind] in ['Property','Variable'] and extra>=len(edge_names):raise ValueError('supported_heap_snapshot_format_required')
        if target not in retainers or len(retainers[target])>=8:continue
        edge_type=edge_types[kind];name=edge_names[extra] if edge_type in ['Property','Variable'] and extra<len(edge_names) else extra
        size,klass=by_id[source];retainers[target].append({'fromId':source,'fromClass':names[klass],'fromShallowBytes':size,'edgeType':edge_type,'edgeName':name})
    return {'sourceSha256':hashlib.sha256(text.encode()).hexdigest(),'sourceBytes':len(text.encode()),'snapshot':data,
            'summary':{'formatVersion':3,'nodeCount':len(by_id),'edgeCount':len(edges)//4,'totalShallowBytes':total,
                       'classes':sorted(classes.values(),key=lambda x:x['shallowBytes'],reverse=True),
                       'largestObjects':[{'id':ident,'className':names[by_id[ident][1]],'shallowBytes':by_id[ident][0],'immediateRetainers':retainers[ident],'retainersLimitedTo':8} for ident in largest],
                       'interpretation':'Shallow sizes and sampled immediate incoming edges only; no retained size, dominator tree or leak diagnosis.'}}
