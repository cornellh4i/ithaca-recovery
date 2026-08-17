import { parseMarkdown } from "../../util/docs/parseMarkdown";

describe("parseMarkdown code blocks", () => {
  it("wraps a fenced block in a codeBlock with a copy button ahead of the pre", () => {
    const { html } = parseMarkdown("```sh\necho hello\n```");
    expect(html).toContain('<div class="codeBlock">');
    expect(html).toMatch(
      /<button type="button" class="codeCopyButton" aria-label="Copy code block">[\s\S]*<\/button><pre>/,
    );
    expect(html).toContain("echo hello");
  });

  it("keeps marked's HTML escaping inside the wrapped block", () => {
    const { html } = parseMarkdown("```\ncount < 1 && echo \"<done>\"\n```");
    expect(html).toContain("count &lt; 1 &amp;&amp; echo &quot;&lt;done&gt;&quot;");
    expect(html).not.toContain("<done>");
  });

  it("carries both state icons so the copy handler only flips an attribute", () => {
    const { html } = parseMarkdown("```\nx\n```");
    expect(html).toContain('class="codeCopyIconCopy"');
    expect(html).toContain('class="codeCopyIconCheck"');
  });

  it("wraps every block, and leaves inline code and headings alone", () => {
    const { html, toc } = parseMarkdown(
      "## Setup\n\nRun `yarn dev` first.\n\n```\none\n```\n\ntext\n\n```\ntwo\n```",
    );
    expect(html.match(/class="codeBlock"/g)).toHaveLength(2);
    expect(html).toContain("<code>yarn dev</code>");
    expect(html).not.toMatch(/<code>yarn dev<\/code>[\s\S]*codeCopyButton[\s\S]*<code>yarn dev/);
    expect(toc).toEqual([{ level: 2, text: "Setup", slug: "setup" }]);
  });
});
