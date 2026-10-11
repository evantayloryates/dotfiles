"""One fixed synced-Shortcut Chrome handoff; qualification only, no URL output."""
import asyncio
import json
import logging
from pathlib import Path
import sys
from urllib.parse import quote

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from device_observer import owned,browser_launch_arguments,payload_launch
from paired_transport import paired_rsd

logging.disable(logging.CRITICAL)

async def main(r):
    owned(r)
    source=json.loads(Path(r['launchFile']).read_text())['url']
    request={**r,'browser':'chrome','profile':'app','url':source}
    browser_launch_arguments(request)
    url='shortcuts://run-shortcut?name=Runner%20Open%20Chrome%20DEV&input=text&text='+quote(source.replace('https:','googlechromes:',1),safe='')
    async with paired_rsd(r['state'],r['serial'],lambda:owned(r)) as (rsd,transport):
        owned(r)
        pid=await asyncio.wait_for(payload_launch(r,rsd,'com.apple.shortcuts',url,'fixed_chrome_shortcut'),12)
        return {'ok':True,'inputSent':True,'pid':pid,'transport':transport,'chromeForegroundVerified':False,'pageReadyVerified':False,'replay':False}

if __name__=='__main__':
    r=json.load(sys.stdin)
    try:print(json.dumps(asyncio.run(asyncio.wait_for(main(r),25))))
    except Exception as e:
        print(json.dumps({'ok':False,'failureType':type(e).__name__,'inputSent':r.get('_launchSent',False),'replay':False}));sys.exit(1)
