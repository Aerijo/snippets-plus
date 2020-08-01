// These specs cover the package interaction, such as activation / deactivation,
// gathering snippets from other packages, observing user snippets, etc.

// const { SnippetsPlus } = require("../lib/snippets-plus");

const path = require("path");

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

  describe("when loading snippets for a package", () => {
    function expectKeys(object, keys) {
      for (const key of keys) {
        expect(object[key]).toBeDefined();
      }
    }

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
      expectKeys(snippets, ["p1-1", "p2-1"]);
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
      expectKeys(snippets, ["p1-1", "p2-1"]);
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
      expectKeys(snippets, ["p1-1", "p2-1", "t2"]);
      expect(snippets["t2"].body).toBe("More specific selector");

      snippets = snippetsPlus.getSnippetsForSelector("*");
      expectKeys(snippets, ["p1-1", "p2-1", "t2"]);
      expect(snippets["t2"].body).toBe("Less specific selector");

      await atom.packages.deactivatePackage("package1");

      await snippetsPlus.queuePackageOperation(pkg1, () => {});

      snippets = snippetsPlus.getSnippetsForSelector(".source.js");
      expectKeys(snippets, ["p2-1", "t2"]);
      expect(snippets["t2"].body).toBe("Less specific selector");
    });

    it("searches the 'snippets' directory recursively for all snippet files", async () => {
      loadFixturePackage("package3");
      const pkg3 = await atom.packages.activatePackage("package3");
      await activatePackage();
      await snippetsPlus.queuePackageOperation(pkg3, () => {});

      let snippets = snippetsPlus.getSnippetsForSelector("*");
      expectKeys(snippets, ["t1", "t2", "t3", "t4"]);
      expect(snippets["t5"]).toBeUndefined();
    });
  });
});
