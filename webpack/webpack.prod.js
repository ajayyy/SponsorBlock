import { merge } from "webpack-merge";
import common from './webpack.common.js';

export default env => {
    let mode = "production";
    env.mode = mode;

    return merge(common(env), {
        mode
    });
};