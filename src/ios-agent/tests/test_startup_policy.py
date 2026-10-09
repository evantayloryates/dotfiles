"""Compile the actual native policy and exercise startup failure boundaries."""
import pathlib
import subprocess
import tempfile
import unittest

class StartupPolicy(unittest.TestCase):
    def test_one_bounded_foreground_remote_fallback(self):
        policy=pathlib.Path(__file__).resolve().parents[1]/'native/StartupPolicy.inc'
        with tempfile.TemporaryDirectory() as directory:
            source=pathlib.Path(directory)/'policy.m'
            binary=pathlib.Path(directory)/'policy'
            source.write_text('''#import <Foundation/Foundation.h>
#include <math.h>
#import "'''+str(policy)+'''"
int main(void) {
 if(!IAStartupShouldFallback(@"tailnet-Metro",45,NO,YES,NO))return 1;
 if(IAStartupShouldFallback(@"tailnet-Metro",44.99,NO,YES,NO))return 2;
 if(IAStartupShouldFallback(@"tailnet-Metro",90,YES,YES,NO))return 3;
 if(IAStartupShouldFallback(@"tailnet-Metro",90,NO,NO,NO))return 4;
 if(IAStartupShouldFallback(@"tailnet-Metro",90,NO,YES,YES))return 5;
 if(IAStartupShouldFallback(@"embedded",90,NO,YES,NO))return 6;
 if(IAStartupShouldFallback(@"standard-Metro",90,NO,YES,NO))return 7;
 if(IAStartupShouldFallback(@"tailnet-Metro",NAN,NO,YES,NO))return 8;
 return 0;
}
''')
            subprocess.run(['xcrun','clang','-framework','Foundation',str(source),'-o',str(binary)],check=True,capture_output=True,timeout=30)
            subprocess.run([str(binary)],check=True,capture_output=True,timeout=5)

if __name__=='__main__': unittest.main()
