"""Provider boundary tests use explicit test doubles, never a live account."""
import base64
import io
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock, patch
from PIL import Image
import vibe_bridge as bridge

STATE = {'configured': True, 'provider': 'test-fixture', 'model': 'fixture-model'}
class ProviderBoundaryTests(unittest.TestCase):
    def test_research_sends_evidence_to_vibe_adapter_and_closes_it(self):
        bars=[{'time':1700000000000+i*300000,'open':100+i,'high':102+i,'low':99+i,'close':101+i} for i in range(180)]
        response=Mock(content='Fixture-only research',response_model='reported-fixture-model',usage_metadata={'input_tokens':123,'output_tokens':20,'total_tokens':143})
        llm=Mock();llm.chat.return_value=response
        with patch.object(bridge,'connection_status',return_value=STATE), patch('src.providers.chat.ChatLLM',return_value=llm):
            result=bridge.handle({'action':'research','bars':bars,'source':'demo','symbol':'BTCUSD','timeframe':'M5','question':'Explain the evidence'})
        messages=llm.chat.call_args.args[0];payload=json.loads(messages[1]['content'])
        self.assertEqual(payload['source'],'demo');self.assertEqual(len(payload['candles']),120);self.assertEqual(payload['indicators']['bar_count'],180)
        self.assertEqual(result['answer'],'Fixture-only research');self.assertEqual(result['model'],'reported-fixture-model');self.assertEqual(result['usage']['total_tokens'],143)
        llm.close.assert_called_once();self.assertNotIn('tools',llm.chat.call_args.kwargs)

    def test_vision_uses_vibe_image_tool_and_cleans_temporary_file_on_both_outcomes(self):
        buffer=io.BytesIO();Image.new('RGB',(80,50),'white').save(buffer,format='PNG');data='data:image/png;base64,'+base64.b64encode(buffer.getvalue()).decode()
        for success in (True,False):
            seen=[]
            def execute(**kwargs):
                path=Path(kwargs['path']);self.assertTrue(path.is_file());self.assertIn('USER QUESTION',kwargs['question']);self.assertIn('Test level',kwargs['question']);seen.append(path)
                return json.dumps({'ok':True,'data':{'answer':'Fixture-only image response'}} if success else {'ok':False,'error':'fixture provider failure'})
            with tempfile.TemporaryDirectory() as runtime, patch.dict(os.environ,{'VIBE_TRADING_HOME':runtime}),patch.object(bridge,'connection_status',return_value=STATE),patch('src.tools.image_vision_tool.AnalyzeImageTool.execute',side_effect=execute):
                if success:self.assertEqual(bridge.handle({'action':'image','image':data,'notes':[{'x':0.5,'y':0.3,'text':'Test level'}]})['answer'],'Fixture-only image response')
                else:
                    with self.assertRaises(bridge.BridgeError):bridge.handle({'action':'image','image':data,'notes':[{'x':0.5,'y':0.3,'text':'Test level'}]})
                self.assertEqual(len(seen),1);self.assertFalse(seen[0].exists())

if __name__=='__main__':unittest.main()
