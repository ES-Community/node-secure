import { get as getRequest } from "@myunisoft/httpie";
import send from "@polka/send-type";

const kBaseBundlePhobiaUrl = "https://bundlephobia.com/api";

export async function get(req, res) {
  const { pkgName, version } = req.params;

  const pkgTemplate = version ? `${pkgName}@${version}` : pkgName;
  try {
    const { data } = await getRequest(`${kBaseBundlePhobiaUrl}/size?package=${pkgTemplate}`);
    const { gzip, size, dependencySizes } = data;

    return send(res, 200, {
      gzip,
      size,
      dependencySizes
    });
  }
  catch (error) {
    return send(res, error.statusCode, { error: error.statusMessage });
  }
}
