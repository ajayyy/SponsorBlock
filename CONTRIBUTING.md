If you make any contributions to SponsorBlock after this file was created, you are agreeing that any code you have contributed will be licensed under LGPL-3.0.

# All Platforms
Make sure to pull and update all submodules  
`git submodule update --init --recursive`

"? property does not exist on type ConfigClass"
> Make sure to copy `config.json.example` to `config.json` and remove comments

# Windows
"Cannot find module "../maze-utils"
- Enable "Developer Mode" in windows for symlinks
- `src/maze-utils` will not appear properly and builds will fail since it is is only rendered as a file  
- Enable symlink support in git `git config --global core.symlinks true`  
- run `git checkout -- src/maze-utils` in order to create a symlink instead of a text file  