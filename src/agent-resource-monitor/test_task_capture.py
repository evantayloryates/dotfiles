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


if __name__=='__main__':unittest.main()
