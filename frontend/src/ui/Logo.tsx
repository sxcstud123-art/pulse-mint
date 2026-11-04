// Pulse Mint mark: steel vault door with a mint pulse line (raster, rounded crop; see public/logo-*.png).
const B = import.meta.env.BASE_URL;
export default function Logo({ size = 38 }: { size?: number }) {
  return (
    <img className="logo" src={B + "logo-128.png"} srcSet={`${B}logo-64.png 1x, ${B}logo-128.png 2x, ${B}logo-192.png 3x`}
      width={size} height={size} alt="Pulse Mint logo" decoding="async" />
  );
}
