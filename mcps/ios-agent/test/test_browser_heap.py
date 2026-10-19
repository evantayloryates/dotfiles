import json
import unittest
from browser_heap import project_snapshot

class HeapTests(unittest.TestCase):
    def fixture(self):return {'version':3,'type':'Inspector','nodes':[0,0,0,0,1,32,1,0,2,64,1,0,3,16,2,0],'nodeClassNames':['<root>','Object','Array'],'edges':[0,1,0,0,1,2,1,0,2,3,2,0],'edgeTypes':['Internal','Property','Index'],'edgeNames':['held']}
    def test_full_graph_retained_with_shallow_classes_and_immediate_edges(self):
        source=self.fixture();r=project_snapshot(json.dumps(source));self.assertEqual(r['snapshot'],source)
        s=r['summary'];self.assertEqual(s['nodeCount'],4);self.assertEqual(s['edgeCount'],3);self.assertEqual(s['totalShallowBytes'],112)
        self.assertEqual(s['classes'][0],{'className':'Object','count':2,'shallowBytes':96})
        self.assertEqual(s['largestObjects'][0]['id'],2);self.assertEqual(s['largestObjects'][0]['immediateRetainers'][0]['edgeName'],'held')
        self.assertIn('no retained size',s['interpretation']);self.assertEqual(len(r['sourceSha256']),64)
    def test_unknown_format_and_bad_graph_are_refused(self):
        for change in [{'version':4},{'nodes':[1,2]},{'edges':[99,2,0,0]},{'nodes':[0,-1,0,0]},{'nodes':[0,0,100,0]}]:
            source={**self.fixture(),**change}
            with self.assertRaisesRegex(ValueError,'supported_heap_snapshot_format_required'):project_snapshot(json.dumps(source))
    def test_incoming_edge_projection_is_sampled_while_raw_graph_is_complete(self):
        source=self.fixture();source['edges']=[1,2,1,0]*20;r=project_snapshot(json.dumps(source))
        self.assertEqual(len(r['summary']['largestObjects'][0]['immediateRetainers']),8);self.assertEqual(len(r['snapshot']['edges']),80)

if __name__=='__main__':unittest.main()
