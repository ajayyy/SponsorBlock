module.exports = {
    "roots": [
        "test"
    ],
    "transform": {
        "^.+\\.ts$": "ts-jest"
    },
    "reporters": ["default", "github-actions"],
    "moduleNameMapper": {
        "^react$": "preact/compat",
        "^react-dom$": "preact/compat",
      }
}; 
