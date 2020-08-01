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

  // beforeEach(async () => {
  //   snippetsPlusPkg = await atom.packages.activatePackage("snippets-plus");
  //   mainModule = snippetsPlusPkg.mainModule;
  // });

  // describe("when loading snippets for a package", () => {
  //   it("finds all .cson and .json files in the 'snippets' directory", async () => {
  //     await Promise.all([loadFixturePackage("package1")]);
  //
  //     expect(atom.packages.getLoadedPackage("package1")).toBeDefined();
  //
  //     await activatePackage();
  //
  //     expect(snippetsPlus.getSnippetsForSelector("*")).toBeUndefined();
  //
  //     await atom.packages.activatePackage("package1");
  //
  //     await snippetsPlus.queuePackageOperation("package1", () => {
  //       expect(snippetsPlus.getSnippetsForSelector("*")).toBeDefined();
  //     });
  //
  //     console.log(mainModule);
  //     debugger;
  //   });
  // });
});
