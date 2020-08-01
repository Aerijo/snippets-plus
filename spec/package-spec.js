// These specs cover the package interaction, such as activation / deactivation,
// gathering snippets from other packages, observing user snippets, etc.

const fs = require("fs");
const path = require("path");
const tmp = require("tmp-promise");

tmp.setGracefulCleanup();

describe("Package interaction", () => {
  let snippetsPlusPkg;
  let mainModule;
  let snippetsPlus;

  async function activatePackage() {
    snippetsPlusPkg = await atom.packages.activatePackage("snippets-plus");
    mainModule = snippetsPlusPkg.mainModule;
    snippetsPlus = mainModule.snippetsPlus;
  }

  function loadFixturePackage(name) {
    return atom.packages.loadPackage(
      path.join(__dirname, "fixtures", "packages", name)
    );
  }

  function expectExactKeys(object, keys) {
    for (const key of Object.keys(object)) {
      expect(keys.includes(key)).toBe(true);
    }

    for (const key of keys) {
      expect(object[key]).toBeDefined();
    }
  }

  describe("when loading snippets for a package", () => {
    it("loads snippets for all existing active packages", async () => {
      loadFixturePackage("package1");
      loadFixturePackage("package2");

      expect(atom.packages.getLoadedPackage("package1")).toBeTruthy();
      expect(atom.packages.getLoadedPackage("package2")).toBeTruthy();
      expect(atom.packages.getActivePackage("package1")).toBeFalsy();
      expect(atom.packages.getActivePackage("package2")).toBeFalsy();

      const [pkg1, pkg2] = await Promise.all([
        atom.packages.activatePackage("package1"),
        atom.packages.activatePackage("package2"),
      ]);

      expect(atom.packages.getActivePackage("package1")).toBeTruthy();
      expect(atom.packages.getActivePackage("package2")).toBeTruthy();

      await activatePackage();

      await snippetsPlus.queuePackageOperation(pkg1, () => {});
      await snippetsPlus.queuePackageOperation(pkg2, () => {});

      const snippets = snippetsPlus.getSnippetsForSelector("*");
      expectExactKeys(snippets, ["p1-1", "p2-1", "t2"]);
    });

    it("loads snippets for packages activated after this one", async () => {
      await activatePackage();

      loadFixturePackage("package1");
      loadFixturePackage("package2");

      expect(atom.packages.getLoadedPackage("package1")).toBeTruthy();
      expect(atom.packages.getLoadedPackage("package2")).toBeTruthy();
      expect(atom.packages.getActivePackage("package1")).toBeFalsy();
      expect(atom.packages.getActivePackage("package2")).toBeFalsy();

      expect(snippetsPlus.getSnippetsForSelector("*")).toEqual({});

      const [pkg1, pkg2] = await Promise.all([
        atom.packages.activatePackage("package1"),
        atom.packages.activatePackage("package2"),
      ]);

      expect(atom.packages.getActivePackage("package1")).toBeTruthy();
      expect(atom.packages.getActivePackage("package2")).toBeTruthy();

      await snippetsPlus.queuePackageOperation(pkg1, () => {});
      await snippetsPlus.queuePackageOperation(pkg2, () => {});

      const snippets = snippetsPlus.getSnippetsForSelector("*");
      expectExactKeys(snippets, ["p1-1", "p2-1", "t2"]);
    });

    it("unloads snippets when packages are deactivated", async () => {
      loadFixturePackage("package1");
      loadFixturePackage("package2");

      const [pkg1, pkg2] = await Promise.all([
        atom.packages.activatePackage("package1"),
        atom.packages.activatePackage("package2"),
      ]);

      await activatePackage();

      await snippetsPlus.queuePackageOperation(pkg1, () => {});
      await snippetsPlus.queuePackageOperation(pkg2, () => {});

      let snippets = snippetsPlus.getSnippetsForSelector(".source.js");
      expectExactKeys(snippets, ["p1-1", "p2-1", "t2"]);
      expect(snippets["t2"].body).toBe("More specific selector");

      snippets = snippetsPlus.getSnippetsForSelector("*");
      expectExactKeys(snippets, ["p1-1", "p2-1", "t2"]);
      expect(snippets["t2"].body).toBe("Less specific selector");

      await atom.packages.deactivatePackage("package1");

      await snippetsPlus.queuePackageOperation(pkg1, () => {});

      snippets = snippetsPlus.getSnippetsForSelector(".source.js");
      expectExactKeys(snippets, ["p2-1", "t2"]);
      expect(snippets["t2"].body).toBe("Less specific selector");
    });

    it("searches the 'snippets' directory recursively for all snippet files", async () => {
      loadFixturePackage("package3");
      const pkg3 = await atom.packages.activatePackage("package3");
      await activatePackage();
      await snippetsPlus.queuePackageOperation(pkg3, () => {});

      let snippets = snippetsPlus.getSnippetsForSelector("*");
      expectExactKeys(snippets, ["t1", "t2", "t3", "t4"]);
    });
  });

  describe("when loading snippets from the user file", () => {
    it("finds the path based on the 'atom.getConfigDirPath' value", async () => {
      const configDirPath = (
        await tmp.dir({ prefix: "atom-snippets-plus-test" })
      ).path;

      fs.copyFileSync(
        path.join(__dirname, "fixtures", "userSnippets.cson"),
        path.join(configDirPath, "snippets.cson")
      );

      spyOn(atom, "getConfigDirPath").andReturn(configDirPath);

      await activatePackage();

      expect(snippetsPlus.getUserSnippetsPath()).toBe(
        path.join(configDirPath, "snippets.cson")
      );
    });
  });

  describe("the resolver services", () => {
    it("accepts 'snippets.resolver' providers", async () => {
      atom.clipboard.write("clip");

      await activatePackage();

      expect(snippetsPlus.transformResolver.resolve("upcase", "Foo")).toBe(
        "FOO"
      );
      expect(snippetsPlus.variableResolver.resolve("CLIPBOARD")).toBe("clip");

      loadFixturePackage("package4");
      const pkg4 = await atom.packages.activatePackage("package4");

      await snippetsPlus.queuePackageOperation(pkg4, () => {});

      expect(snippetsPlus.transformResolver.resolve("upcase", "Foo")).toBe(
        "foo"
      );

      expect(snippetsPlus.variableResolver.resolve("CLIPBOARD")).toBe(
        "OVERRIDDEN"
      );

      await atom.packages.deactivatePackage("package4");
      await snippetsPlus.queuePackageOperation(pkg4, () => {});

      expect(snippetsPlus.transformResolver.resolve("upcase", "Foo")).toBe(
        "FOO"
      );

      expect(snippetsPlus.variableResolver.resolve("CLIPBOARD")).toBe("clip");
    });
  });
});
