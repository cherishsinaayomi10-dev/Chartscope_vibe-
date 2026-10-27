// Run this explicitly in a terminal on the server. The app never starts login itself.
import {spawn} from 'node:child_process';
import {python,vibeEnv} from './vibe.mjs';
const child=spawn(python,['-c','from cli import main; main()','provider','login','openai-codex'],{env:vibeEnv,stdio:'inherit'});
child.on('error',()=>{console.error('Install the bundled Vibe-Trading dependencies first.');process.exitCode=1});
child.on('exit',code=>{process.exitCode=code??1});
