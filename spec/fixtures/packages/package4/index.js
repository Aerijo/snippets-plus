module.exports = {
  activate() {},

  provideResolvers() {
    return {
      transformResolver: {
        priority: 0,
        resolver: (name, input, _context) => {
          if (name === "upcase") {
            return input.toLowerCase();
          } else if (name === "downcase") {
            return input.toUpperCase();
          }
        },
      },
      variableResolver: {
        priority: 0,
        resolver: (name, _context) => {
          if (name === "CLIPBOARD") {
            return "OVERRIDDEN";
          }
        },
      },
    };
  },
};
