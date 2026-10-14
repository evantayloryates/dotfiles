import json
from pathlib import Path
import sys
import unittest

sys.path.insert(0,str(Path(__file__).parent))
import task_capture as t


class TaskCapture(unittest.TestCase):
    def test_structural_task_identity_and_extensionless_tools(self):
        self.assertEqual(t.identify(['node','/private/node_modules/.bin/tsc','--noEmit']),
                         {'tool':'tsc','flags':['--noEmit']})
        self.assertEqual(t.identify(['node','/private/yarn.js','run','test:gateway','--token','SECRET']),
                         {'tool':'yarn','task':'test:gateway'})
        self.assertEqual(t.identify(['yarn','workspace','SECRET','run','lint:types']),
                         {'tool':'yarn','task':'lint:types'})
        self.assertEqual(t.identify(['node','--require','/private/SECRET','/private/jest.js','--runInBand']),
                         {'tool':'jest','flags':['--runInBand']})

    def test_inline_and_unrecognized_input_never_retains_content(self):
        cases=[['node','-e','SECRET'],['node','--eval=SECRET'],['node','--title','SECRET','-p','SECRET'],
               ['node','/private/SECRET.ts','SECRET'],['npm','run','SECRET'],
               ['bash','-c','SECRET'],['node','--unknown','SECRET']]
        for argv in cases:
            output=json.dumps(t.identify(argv))
            self.assertNotIn('SECRET',output)
            self.assertNotIn('/private/',output)

    def test_guest_rankings_preserve_hot_process_and_ancestry_without_arguments(self):
        rows=['PID PPID RSS %CPU ELAPSED COMMAND']
        rows += [f'{i} 1 {i*10} 0.0 20 /private/SECRET --password SECRET' for i in range(1,101)]
        rows += ['201 1 100 0.0 10 node /private/yarn.js run test:gateway --token SECRET',
                 '202 201 2048 230.0 1 node /private/node_modules/.bin/tsc --noEmit --secret SECRET']
        result=t.parse_top('\n'.join(rows))
        self.assertEqual(result['process_count'],102)
        self.assertLessEqual(len(result['processes']),24)
        by={p['pid']:p for p in result['processes']}
        self.assertEqual(by[202]['task_identity']['tool'],'tsc')
        self.assertEqual(by[201]['task_identity']['task'],'test:gateway')
        self.assertEqual(by[202]['rss_bytes'],2048*1024)
        self.assertEqual(by[202]['cpu_lifetime_percent'],230)
        self.assertNotIn('SECRET',json.dumps(result))
        self.assertNotIn('/private',json.dumps(result))

    def test_guest_caps_timeout_truncation_and_no_retry(self):
        calls=[]
        containers=[dict(ID=f'{i:012x}',CPUPerc=f'{i*50}%',MemUsage=f'{i}GiB / 12GiB') for i in range(1,6)]
        containers += [dict(ID='INVALID; SECRET',CPUPerc='9999%',MemUsage='9GiB')]
        def run(args,timeout,limit):
            calls.append((args,timeout,limit))
            return dict(status='timeout',duration_ms=2000) if len(calls)==1 else dict(status='ok',duration_ms=1,truncated=True,output='SECRET')
        result=t.guest_rankings('/fixture/docker',containers,run,lambda:'now')
        self.assertEqual(len(calls),2)
        self.assertTrue(all(x[1:]==(2,256*1024) for x in calls))
        self.assertTrue(all(x[0][1]=='top' for x in calls))
        self.assertEqual([c['status'] for c in result['containers']],['timeout','truncated'])
        self.assertEqual(result['status'],'partial')
        self.assertNotIn('SECRET',json.dumps(result))

    def test_invalid_and_oversized_guest_rows_have_explicit_coverage(self):
        with self.assertRaises(ValueError):t.parse_top('SECRET')
        result=t.parse_top('PID PPID RSS %CPU ELAPSED COMMAND\n1 0 -1 20 0 node SECRET\n'+
                           '\n'.join(f'{i} 0 0 0 1 sleep SECRET' for i in range(2,2052)))
        self.assertTrue(result['row_limit_hit'])
        self.assertEqual(result['rows_considered'],2048)
        self.assertEqual(result['malformed_rows'],1)
        self.assertLessEqual(len(result['processes']),24)
        self.assertNotIn('SECRET',json.dumps(result))

    def test_next_process_titles_are_anchored_and_do_not_retain_versions(self):
        for title in ['next-server', 'next-server (v15.4.5)', 'next-server (v15.4.5-canary.12)']:
            result=t.parse_top('PID PPID RSS %CPU ELAPSED COMMAND\n1 0 2048 40 20 '+title)
            proc=result['processes'][0]
            self.assertEqual(proc['task_identity'], {'tool':'next','role':'server'})
            self.assertEqual(proc['identity_evidence'],'process-title')
            self.assertNotIn('v15',json.dumps(result))
        for title in ['node -e next-server', 'sh -c next-server', 'next-server SECRET',
                      '/private/next-server (v15.4.5)', 'next-server (SECRET)']:
            result=t.parse_top('PID PPID RSS %CPU ELAPSED COMMAND\n1 0 2048 40 20 '+title)
            self.assertNotEqual(result['processes'][0]['identity_evidence'],'process-title')
            self.assertNotIn('SECRET',json.dumps(result))

    def test_fixed_framework_worker_entrypoints_and_privacy(self):
        cases=[('next/dist/compiled/jest-worker/processChild.js','next','process-worker'),
               ('next/dist/server/lib/start-server.js','next','server-start'),
               ('jest-worker/build/workers/processChild.js','jest-worker','process-worker'),
               ('jest-worker/build/workers/threadChild.js','jest-worker','thread-worker'),
               ('piscina/dist/worker.js','piscina','thread-worker'),
               ('vitest/dist/worker.js','vitest','test-worker')]
        for entry,tool,role in cases:
            identity=t.identify(['node','/private/SECRET/node_modules/'+entry,'--token','SECRET'])
            self.assertEqual(identity['tool'],tool);self.assertEqual(identity['role'],role)
            self.assertNotIn('SECRET',json.dumps(identity))
        for path in ['/private/processChild.js','/private/node_modules/jest-worker/build/workers/processChild.js.SECRET',
                     '/private/not_node_modules/next/dist/server/lib/start-server.js']:
            self.assertEqual(t.identify(['node',path])['mode'],'unrecognized_entrypoint')

    def test_named_task_ancestry_survives_pruning_without_becoming_worker_identity(self):
        lines=['PID PPID RSS %CPU ELAPSED COMMAND',
               '1 0 1 0 100 yarn workspace SECRET run build:server:development --token SECRET',
               '2 1 1 0 90 sh -c SECRET',
               '3 2 1 0 80 node /private/node_modules/next/dist/server/lib/start-server.js',
               '208 3 10000 0 70 next-server (v15.4.5)']
        # Saturate the retained parent budget, but context uses the full bounded
        # snapshot. No extra Docker call or guest filesystem lookup is needed.
        lines += [f'{i} {i+300} 10 {300-i} 70 sleep SECRET' for i in range(101,109)]
        lines += [f'{i+300} 0 1 0 80 sh -c SECRET' for i in range(101,109)]
        lines += [f'{i} 0 {11000+208-i} 0 70 sleep SECRET' for i in range(201,208)]
        result=t.parse_top('\n'.join(lines));by={p['pid']:p for p in result['processes']}
        worker=by[208];context=worker['task_context']
        self.assertEqual(worker['task_identity'],{'tool':'next','role':'server'})
        self.assertEqual(context['identity'],{'tool':'yarn','task':'build:server:development'})
        self.assertEqual((context['ancestor_pid'],context['distance']),(1,3))
        self.assertEqual(context['evidence'],'same-snapshot-ancestry')
        self.assertEqual(len(by),24)
        self.assertNotIn(1,by)
        self.assertGreater(result['named_task_context_covered'],0)
        self.assertNotIn('SECRET',json.dumps(result));self.assertNotIn('/private',json.dumps(result))

    def test_ancestry_depth_cycles_and_parent_age_reject_false_context(self):
        def p(pid,ppid,elapsed,identity=None):
            return dict(pid=pid,ppid=ppid,elapsed_seconds=elapsed,task_identity=identity)
        task={'tool':'yarn','task':'test:gateway'}
        rows=[p(1,2,10),p(2,1,20)]
        self.assertIsNone(t.task_context(rows[0],{x['pid']:x for x in rows}))
        rows=[p(1,2,10),p(2,0,9,task)]
        self.assertIsNone(t.task_context(rows[0],{x['pid']:x for x in rows}))
        rows=[p(i,i+1,10+i) for i in range(1,6)]+[p(6,0,30,task)]
        self.assertIsNone(t.task_context(rows[0],{x['pid']:x for x in rows}))
        # Unknown direct worker remains unknown despite a recognized parent.
        output=t.parse_top('PID PPID RSS %CPU ELAPSED COMMAND\n1 0 1 0 20 yarn run lint\n2 1 2048 99 10 node /private/SECRET.js')
        child=next(x for x in output['processes'] if x['pid']==2)
        self.assertEqual(child['task_identity']['mode'],'unrecognized_entrypoint')
        self.assertEqual(child['task_context']['identity']['task'],'lint')
        self.assertNotIn('SECRET',json.dumps(output))


if __name__=='__main__':unittest.main()
