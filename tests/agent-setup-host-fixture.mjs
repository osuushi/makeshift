export async function injectHost(app, root, executable) {
  await app.evaluate(
    async ({ app }, paths) => {
      const base = `${app.getAppPath()}/.build/host`;
      const require = process
        .getBuiltinModule("node:module")
        .createRequire(`${app.getAppPath()}/package.json`);
      const { AgentSetup } = require(`${base}/host/agent-setup.js`);
      const { AgentSession } = require(`${base}/host/agent-session.js`);
      const { CodexInstaller } = require(`${base}/host/codex-installer.js`);
      const { discoverCodex } = require(`${base}/host/codex-discovery.js`);
      const { NativeCalculator } = require(`${base}/backend/native-calculator.js`);
      const request = AgentSetup.prototype.request,
        sessionRequest = AgentSession.prototype.request;
      const calculate = NativeCalculator.prototype.calculate;
      const state = { attempts: 0, calculations: 0, installer: null, session: null, restore: null };
      NativeCalculator.prototype.calculate = function (...args) {
        state.calculations++;
        return calculate.apply(this, args);
      };
      AgentSession.prototype.request = function (...args) {
        state.session = this;
        return sessionRequest.apply(this, args);
      };
      AgentSetup.prototype.request = function (...args) {
        if (!state.installer) {
          state.installer = this.installer = new CodexInstaller({
            home: paths.root,
            env: { HOME: paths.root, PATH: "/usr/bin:/bin" },
            fetch: async () => {
              const attempt = ++state.attempts;
              if (attempt === 1) return new Response("fixture failure", { status: 403 });
              const script =
                attempt === 2 || attempt === 4
                  ? `#!/bin/sh\n/bin/sleep 90 &\nprintf '%s' "$!" > '${paths.root}/child-${attempt}'\nwait\n`
                  : "#!/bin/sh\nprintf 'Harmless fixture installation complete\\n'\n";
              return new Response(script);
            },
            verify: async (_preferences, cwd, env) => ({
              ...(await discoverCodex(
                { preset: "codex", executable: paths.executable, args: [], env: {} },
                cwd,
                env,
              )),
              source: "standalone",
            }),
          });
        }
        return request.apply(this, args);
      };
      state.restore = async (cancel = true) => {
        if (cancel) await state.installer?.cancel();
        AgentSetup.prototype.request = request;
        AgentSession.prototype.request = sessionRequest;
        NativeCalculator.prototype.calculate = calculate;
      };
      globalThis.agentSetupFixture = state;
    },
    { root, executable },
  );
}
