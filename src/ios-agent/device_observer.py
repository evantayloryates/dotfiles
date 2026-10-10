"""Pinned, read-only paired-device observer. No XCTest, HID, prompts or raw logs."""
import asyncio
import base64
import importlib.metadata
import json
import logging
import os
from pathlib import Path
import re
import sys
from cli import request

logging.disable(logging.CRITICAL)

def owned(r):
    lease = json.loads(Path(r['leaseFile']).read_text())['lease']
    status = request({'op':'status'}, Path(r['state']), timeout=2)
    if not lease or (status.get('lease') or {}).get('id') != lease:
        raise ValueError('observer_owner_expired')

async def observe(r):
    r['_phase']='validation'
    if r.get('kind') not in ('screen','capabilities') or not re.fullmatch(r'[0-9A-Fa-f]{8}-[0-9A-Fa-f]{16}', r.get('serial','')):
        raise ValueError('fixed_observer_request_required')
    if importlib.metadata.version('pymobiledevice3') != '11.15.5':
        raise ValueError('pinned_observer_required')
    from pymobiledevice3.remote.native_tunnel import NativeRemotedTunnel
    from pymobiledevice3.services.dvt.instruments.dvt_provider import DvtProvider
    from pymobiledevice3.services.dvt.instruments.screenshot import Screenshot
    owned(r)
    r['_phase']='native_tunnel'
    async with NativeRemotedTunnel(serial=r['serial']) as rsd:
        r['_phase']='service_discovery'
        services = (rsd.peer_info or {}).get('Services', {})
        caps = {label:name in services for label,name in {
            'dvt':'com.apple.instruments.dtservicehub',
            'coreDeviceScreen':'com.apple.coredevice.screencaptureservice',
            'coreDeviceTouch':'com.apple.coredevice.hid.universalhidservice',
            'webInspectorService':'com.apple.webinspector.shim.remote',
        }.items()}
        result = {'scope':'paired-device-read-only','provider':'pymobiledevice3-11.15.5','transport':'native-remoted','capabilities':caps,'systemInput':False,'offLANQualified':False}
        if r['kind'] == 'screen':
            owned(r)
            r['_phase']='dvt_connect'
            async with DvtProvider(rsd) as dvt, Screenshot(dvt) as screenshot:
                r['_phase']='screen_capture'
                image = await screenshot.get_screenshot()
                r['_phase']='dvt_close'
            r['_phase']='png_validation'
            if len(image)>12*1024*1024 or not image.startswith(b'\x89PNG\r\n\x1a\n'):
                raise ValueError('bounded_png_required')
            from PIL import Image
            import io
            width,height = Image.open(io.BytesIO(image)).size
            result.update(scope='whole-device-display',pngBase64=base64.b64encode(image).decode(),width=width,height=height)
        owned(r)
        r['_phase']='native_tunnel_close'
        return result

def main():
    r=json.load(sys.stdin)
    try:
        result=asyncio.run(asyncio.wait_for(observe(r),22))
        p=Path(r['output']);parent=p.parent
        if not parent.is_dir() or parent.is_symlink() or parent.stat().st_mode & 0o077:
            raise ValueError('private_observer_output_required')
        fd=os.open(p,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
        with os.fdopen(fd,'w') as f:json.dump({'status':'completed','result':result},f)
        print(json.dumps({'ok':True,'scope':result['scope']}))
    except Exception as e:
        known={'InvalidServiceError':'developer_service_unavailable','WebInspectorNotEnabledError':'web_inspector_disabled','DeviceNotFoundError':'paired_device_unavailable','TimeoutError':'device_observation_deadline','ConnectionTerminatedError':'developer_connection_lost'}
        code=known.get(type(e).__name__,'device_observation_unavailable')
        if isinstance(e,ValueError) and str(e) in {'observer_owner_expired','pinned_observer_required','bounded_png_required','private_observer_output_required','fixed_observer_request_required'}:code=str(e)
        print(json.dumps({'ok':False,'reason':code,'phase':r.get('_phase','validation'),'inputSent':False}))
        sys.exit(1)

if __name__=='__main__':main()
