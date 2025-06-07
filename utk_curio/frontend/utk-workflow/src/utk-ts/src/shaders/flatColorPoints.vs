#version 300 es

const float pi = 3.1415926535897932384626433832795;
const float pi_180 = 0.017453292519943295769236907684886127134428718885417254560;
const float pi_4   = 12.56637061435917295385057353311801153678867759750042328389;

uniform highp mat4 uModelViewMatrix;
uniform highp mat4 uProjectionMatrix;
uniform highp vec2 uWorldOrigin;

in highp vec3 vertCoords;

vec2 latLngToPixel(highp float latitude, highp float longitude){
  highp float sinLatitude = sin(latitude * pi_180);
  highp float pixelY = 256.0-((0.5 - log((1.0 + sinLatitude) / (1.0 - sinLatitude)) / (pi_4)) * 256.0);
  highp float pixelX = ((longitude + 180.0) / 360.0) * 256.0;

  return vec2(pixelX,pixelY);
}

void main() {
  highp vec3 finalPos = vertCoords;
  gl_Position = uProjectionMatrix * uModelViewMatrix * vec4(finalPos, 1.0);
  gl_PointSize = 10.0;
}