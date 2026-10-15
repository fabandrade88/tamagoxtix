// node --test tests/
import assert from "node:assert/strict";
import { test } from "node:test";

import { clean, parseRemote } from "../shared/forge.mjs";

test("remotes on GitHub and GitLab, in every URL shape", () => {
  const cases = {
    "https://github.com/fabandrade88/tamaclaude.git": ["github", "github.com", "fabandrade88/tamaclaude"],
    "git@github.com:fabandrade88/tamaclaude.git": ["github", "github.com", "fabandrade88/tamaclaude"],
    "https://gitlab.com/gitlab-org/cli.git": ["gitlab", "gitlab.com", "gitlab-org/cli"],
    "git@gitlab.com:group/sub/project.git": ["gitlab", "gitlab.com", "group/sub/project"],
    "https://gitlab.company.com/team/app": ["gitlab", "gitlab.company.com", "team/app"],
    "ssh://git@gitlab.company.com:2222/team/app.git": ["gitlab", "gitlab.company.com", "team/app"],
  };
  for (const [remote, [forge, host, path]] of Object.entries(cases)) {
    assert.deepEqual(parseRemote(remote), { forge, host, path }, remote);
  }
});

test("other hosts and odd remotes are not a forge", () => {
  for (const remote of ["https://bitbucket.org/x/y.git", "", null, undefined, "not a url", "/home/me/repo"]) {
    assert.equal(parseRemote(remote), null, String(remote));
  }
});

test("remotes that would inject into a URL or a terminal are refused", () => {
  for (const remote of [
    "https://github.com/a/b\u001b[31m.git",
    "https://github.com/a/b?x=1",
    "https://github.com/a/b#frag",
    "https://evil.com@github.com/a/b",
    "https://github.com/a/b c",
  ]) {
    const parsed = parseRemote(remote);
    if (parsed) assert.match(parsed.path, /^[\w.\-/]+$/, remote);
  }
  assert.equal(parseRemote("https://github.com/a/b\u001b[31m.git"), null);
});

test("clean strips control characters and caps the length", () => {
  assert.equal(clean("main\u001b]0;pwned\u0007"), "main]0;pwned");
  assert.equal(clean("\u009b31mred"), "31mred");
  assert.equal(clean("x".repeat(200)).length, 80);
  assert.equal(clean(null), "");
});
