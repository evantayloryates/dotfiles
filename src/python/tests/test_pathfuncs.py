"""Exercise generated functions in real zsh processes without launching apps."""
import copy
import os
from pathlib import Path
import shlex
import subprocess
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import pathfuncs


REPO = Path(__file__).resolve().parents[3]


class PathfuncsTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name).resolve()
        self.home = self.root / 'home with spaces \' " $dollars `ticks` $(false)'
        self.home.mkdir()
        self.checkout = self.root / 'relocated dotfiles'
        self.checkout.symlink_to(REPO, target_is_directory=True)
        self.env = dict(os.environ, HOME=str(self.home), DOTFILES_DIR=str(self.checkout))
        # Generate with a different HOME, then reuse with the invoking shell's HOME.
        generated = subprocess.check_output(
            [sys.executable, '-B', str(REPO / 'src/python/pathfuncs.py')],
            env=dict(self.env, HOME=str(self.root / 'generation home')), text=True,
        ).strip()
        self.generated = Path(generated)
        self.addCleanup(self.generated.unlink, missing_ok=True)
        self.prefix = f'source {shlex.quote(generated)}\ncapture() {{ printf "<%s>\\n" "$@"; }}\n'

    def shell(self, script):
        result = subprocess.run(
            ['zsh', '-f', '-c', self.prefix + script], env=self.env,
            cwd=self.root, text=True, capture_output=True,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stderr, '')
        return result.stdout.splitlines()

    def test_generated_syntax_and_home_alias(self):
        subprocess.run(['zsh', '-fn', str(self.generated)], check=True)
        self.assertEqual(self.shell('home; print -r -- "$PWD"; cd /; Home; print -r -- "$PWD"'),
                         [str(self.home)] * 2)
        self.assertEqual(self.shell('home cd; print -r -- "$PWD"'), [str(self.home)])
        second = self.root / 'second home'
        second.mkdir()
        self.assertEqual(self.shell(f'HOME={shlex.quote(str(second))}; Home; print -r -- "$PWD"'),
                         [str(second)])
        self.assertIn('home', self.shell('paths'))

    def test_every_config_path_and_selector_uses_runtime_roots(self):
        # Replace actions with a recorder, retaining all paths/aliases/sub-selectors.
        config = copy.deepcopy(pathfuncs.CONFIG)
        expected = []
        invocations = []
        for entry in config:
            entry.update(default='capture', commands={}, alias_cmds={})
            target = entry['path']
            if target.startswith('~'):
                target = str(self.home) + target[1:]
            elif target.startswith('$DOTFILES_DIR'):
                target = str(self.checkout) + target[len('$DOTFILES_DIR'):]
            for selector in pathfuncs.selectors(entry):
                invocations.append(f"{entry['parent_func']} {selector}" if 'parent_func' in entry else selector)
                expected.append(f'<{target}>')
        functions = '\n'.join(pathfuncs.build_function(e, pathfuncs.subs_of(e, config)) for e in config)
        self.assertEqual(self.shell(functions + '\n' + '\n'.join(invocations)), expected)

    def test_supported_root_spellings_and_literal_paths(self):
        paths = ['~', '~/child', '$HOME', '${HOME}/child', '$DOTFILES_DIR',
                 '${DOTFILES_DIR}/child', str(self.home / 'literal [*]'),
                 '/tmp/$HOME/literal', '~definitely_no_such_pathfuncs_user/child']
        expected = [str(self.home), str(self.home / 'child'), str(self.home),
                    str(self.home / 'child'), str(self.checkout), str(self.checkout / 'child'),
                    str(self.home / 'literal [*]'), '/tmp/$HOME/literal', paths[-1]]
        for target, resolved in zip(paths, expected):
            with self.subTest(target=target):
                fn = pathfuncs.build_function(pathfuncs.p('probe', target, 'capture'))
                self.assertEqual(self.shell(fn + '\nprobe'), [f'<{resolved}>'])

    def test_templates_preserve_suffixes_arguments_and_default_dispatch(self):
        fn = pathfuncs.build_function(pathfuncs.p(
            'probe', '~/target dir', 'run', aliases=['Probe'], alias_cmds={'probe_run': 'run'},
            commands={'run': 'capture <path>/child <args>', 'text': 'capture <args_text>'},
        ))
        self.assertEqual(self.shell(fn + '\nProbe run "two words" "" \'$literal\''),
                         [f'<{self.home}/target dir/child>', '<two words>', '<>', '<$literal>'])
        self.assertEqual(self.shell(fn + '\nunsetopt functionargzero; Probe'),
                         [f'<{self.home}/target dir/child>'])
        self.assertEqual(self.shell(fn + '\nprobe_run "two words"'),
                         [f'<{self.home}/target dir/child>', '<two words>'])
        self.assertEqual(self.shell(fn + '\nprobe text one two'), ['<one two>'])

    def test_file_passthrough_detected_after_generation(self):
        target = self.home / 'new file.txt'
        fn = pathfuncs.build_function(pathfuncs.p('probe', '~/new file.txt'))
        target.touch()
        self.assertEqual(self.shell(fn + '\nprobe pwd; print -r -- "$PWD"; probe cd; print -r -- "$PWD"'),
                         [str(self.home), str(self.root), str(self.home)])

    def test_passthrough_preserves_arguments_state_and_failure(self):
        self.assertEqual(self.shell('''
            home capture "two words" "" '$literal'
            print -r -- "$PWD"
            home false
            print -r -- "$?"
            print -r -- "$PWD"
        '''), ['<two words>', '<>', '<$literal>', str(self.root), '1', str(self.root)])
        self.assertEqual(self.shell('''
            setopt autopushd
            cd /
            before_pwd=$PWD before_old=$OLDPWD
            before_stack=("${dirstack[@]}")
            home true
            [[ "$PWD" == "$before_pwd" && "$OLDPWD" == "$before_old" &&
               "${(j:|:)dirstack}" == "${(j:|:)before_stack}" ]] || exit 1
            home cd
            [[ "$PWD" == "$HOME" ]] || exit 2
            cd - >/dev/null
            [[ "$PWD" == / ]]
        '''), [])

    def test_missing_target_does_not_run_command(self):
        fn = pathfuncs.build_function(pathfuncs.p('probe', '~/missing'))
        self.assertEqual(self.shell(fn + '\nprobe capture unwanted 2>/dev/null; print -r -- "$?" "$PWD"'),
                         ['1 ' + str(self.root)])

    def test_relocated_checkout_and_file_command(self):
        self.assertEqual(self.shell('code() { capture "$@"; }; pathfn; dot; print -r -- "$PWD"'),
                         [f'<{self.checkout}/src/python/pathfuncs.py>', str(self.checkout)])
        self.assertEqual(self.shell('pathfn pwd'), [str(self.checkout / 'src/python')])

    def test_custom_commands_and_legacy_selector_text(self):
        self.assertEqual(self.shell('''
            python3() { capture "$@"; }
            desktop clean --name "two words"
            __amplify_logs() { capture "$@"; }
            amp logs web worker
            make() { capture "$@"; }
            nex ssh
        '''), [f'<{self.checkout}/src/python/desktop.py>', '<clean>', '<--name>', '<two words>',
               '<web worker>', '<-C>', f'<{self.home}/src/github/nexrender-scripts/../nexrender-api>', '<ssh>'])
        kit = copy.deepcopy(next(e for e in pathfuncs.CONFIG if e['slug'] == 'kit'))
        kit['commands']['reload'] = kit['commands']['reload'].replace(
            '/Applications/kitty.app/Contents/MacOS/kitty', 'capture')
        self.assertEqual(self.shell(pathfuncs.build_function(kit) + '\nkitty reload'),
                         ['<@>', '<load-config>', f'<{self.home}/.config/kitty/kitty.conf>'])

    def test_subfunctions_and_reload_cleanup(self):
        (self.home / '.claude/skills').mkdir(parents=True)
        self.assertEqual(self.shell('''
            skills cc cd
            print -r -- "$PWD"
            (( $+functions[cc] || $+functions[claude] || $+functions[codex] )) && exit 1
            obsolete_pathfunc() { :; }
            __PATHFUNCS_NAMES+=(obsolete_pathfunc)
        ''' + f'source {shlex.quote(str(self.generated))}\n' + '''
            (( $+functions[obsolete_pathfunc] == 0 && $+functions[Home] == 1 ))
        '''), [str(self.home / '.claude/skills')])


if __name__ == '__main__':
    unittest.main()
