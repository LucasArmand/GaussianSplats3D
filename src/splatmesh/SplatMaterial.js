import * as THREE from 'three';
import { Constants } from '../Constants.js';

export class SplatMaterial {

    static buildVertexShaderBase(dynamicMode = false, enableOptionalEffects = false, maxSphericalHarmonicsDegree = 0, customVars = '', useSplatRooms = false) {
        let vertexShaderSource = `
        precision highp float;
        #include <common>

        attribute uint splatIndex;
        uniform highp usampler2D centersColorsTexture;
        uniform highp sampler2D sphericalHarmonicsTexture;
        uniform highp sampler2D sphericalHarmonicsTextureR;
        uniform highp sampler2D sphericalHarmonicsTextureG;
        uniform highp sampler2D sphericalHarmonicsTextureB;
    `;

    if (enableOptionalEffects || dynamicMode  || useSplatRooms) {
        vertexShaderSource += `
            uniform highp usampler2D sceneIndexesTexture;
            uniform vec2 sceneIndexesTextureSize;
        `;
    }

    if (enableOptionalEffects) {
        vertexShaderSource += `
            uniform float sceneOpacity[${Constants.MaxScenes}];
            uniform int sceneVisibility[${Constants.MaxScenes}];
        `;
    }

    if (dynamicMode) {
        vertexShaderSource += `
            uniform highp mat4 transforms[${Constants.MaxScenes}];
        `;
    }

    if (useSplatRooms) {
        vertexShaderSource += `
            uniform vec3 aabbMins[${Constants.MaxScenes}];
            uniform vec3 aabbMaxs[${Constants.MaxScenes}];
        `;
    }

    vertexShaderSource += `
        ${customVars}
        uniform vec2 focal;
        uniform float orthoZoom;
        uniform int orthographicMode;
        uniform int pointCloudModeEnabled;
        uniform float inverseFocalAdjustment;
        uniform vec2 viewport;
        uniform vec2 basisViewport;
        uniform vec2 centersColorsTextureSize;
        uniform int sphericalHarmonicsDegree;
        uniform vec2 sphericalHarmonicsTextureSize;
        uniform int sphericalHarmonics8BitMode;
        uniform int sphericalHarmonicsMultiTextureMode;
        uniform float visibleRegionRadius;
        uniform float visibleRegionFadeStartRadius;
        uniform float firstRenderTime;
        uniform float currentTime;
        uniform int fadeInComplete;
        uniform vec3 sceneCenter;
        uniform float splatScale;

        varying vec4 vColor;
        varying vec2 vUv;
        varying vec2 vPosition;
        flat varying uint vSceneIndex;

        mat3 quaternionToRotationMatrix(float x, float y, float z, float w) {
            float s = 1.0 / sqrt(w * w + x * x + y * y + z * z);
        
            return mat3(
                1. - 2. * (y * y + z * z),
                2. * (x * y + w * z),
                2. * (x * z - w * y),
                2. * (x * y - w * z),
                1. - 2. * (x * x + z * z),
                2. * (y * z + w * x),
                2. * (x * z + w * y),
                2. * (y * z - w * x),
                1. - 2. * (x * x + y * y)
            );
        }

        const float sqrt8 = sqrt(8.0);
        const float minAlpha = 1.0 / 255.0;

        const vec4 encodeNorm4 = vec4(1.0 / 255.0, 1.0 / 255.0, 1.0 / 255.0, 1.0 / 255.0);
        const uvec4 mask4 = uvec4(uint(0x000000FF), uint(0x0000FF00), uint(0x00FF0000), uint(0xFF000000));
        const uvec4 shift4 = uvec4(0, 8, 16, 24);
        vec4 uintToRGBAVec (uint u) {
           uvec4 urgba = mask4 & u;
           urgba = urgba >> shift4;
           vec4 rgba = vec4(urgba) * encodeNorm4;
           return rgba;
        }

        vec2 getDataUV(in int stride, in int offset, in vec2 dimensions) {
            vec2 samplerUV = vec2(0.0, 0.0);
            float d = float(splatIndex * uint(stride) + uint(offset)) / dimensions.x;
            samplerUV.y = float(floor(d)) / dimensions.y;
            samplerUV.x = fract(d);
            return samplerUV;
        }

        vec2 getDataUVF(in uint sIndex, in float stride, in uint offset, in vec2 dimensions) {
            vec2 samplerUV = vec2(0.0, 0.0);
            float d = float(uint(float(sIndex) * stride) + offset) / dimensions.x;
            samplerUV.y = float(floor(d)) / dimensions.y;
            samplerUV.x = fract(d);
            return samplerUV;
        }`;

    if (useSplatRooms) {
        vertexShaderSource += `
            vec2 rayIntersectsAABB(vec3 rayOrigin, vec3 rayDir, uint sceneIndex) {
                vec3 tMin = (aabbMins[sceneIndex] - rayOrigin) / rayDir;
                vec3 tMax = (aabbMaxs[sceneIndex] - rayOrigin) / rayDir;
                vec3 t1 = min(tMin, tMax);
                vec3 t2 = max(tMin, tMax);
                float tNear = max(max(t1.x, t1.y), t1.z);
                float tFar = min(min(t2.x, t2.y), t2.z);
                return vec2(tNear, tFar);
            }
        `;
    }
        
    vertexShaderSource += `
        const float SH_C1 = 0.4886025119029199f;
        const float[5] SH_C2 = float[](1.0925484, -1.0925484, 0.3153916, -1.0925484, 0.5462742);

        const float SphericalHarmonics8BitCompressionRange = ${Constants.SphericalHarmonics8BitCompressionRange.toFixed(1)};
        const float SphericalHarmonics8BitCompressionHalfRange = SphericalHarmonics8BitCompressionRange / 2.0;
        const vec3 vec8BitSHShift = vec3(SphericalHarmonics8BitCompressionHalfRange);

        void main () {

            uint oddOffset = splatIndex & uint(0x00000001);
            uint doubleOddOffset = oddOffset * uint(2);
            bool isEven = oddOffset == uint(0);
            uint nearestEvenIndex = splatIndex - oddOffset;
            float fOddOffset = float(oddOffset);

            uvec4 sampledCenterColor = texture(centersColorsTexture, getDataUV(1, 0, centersColorsTextureSize));
            vec3 splatCenter = uintBitsToFloat(uvec3(sampledCenterColor.gba));`;

        if (dynamicMode || enableOptionalEffects || useSplatRooms) {
            vertexShaderSource += `
                uint sceneIndex = texture(sceneIndexesTexture, getDataUV(1, 0, sceneIndexesTextureSize)).r;
            `;
        }
        if (useSplatRooms) {
            vertexShaderSource += `
            vec4 transformedSplatCenter = vec4(splatCenter, 1.0);
            `;
        }
        if (dynamicMode) {
            vertexShaderSource += `
            transformedSplatCenter = transforms[sceneIndex] * transformedSplatCenter;
            `;
        }
        if (useSplatRooms) {
            vertexShaderSource += `
                vec3 rayDir = normalize(transformedSplatCenter.xyz - cameraPosition);
                vec2 intersections = rayIntersectsAABB(cameraPosition, rayDir, sceneIndex);
                float tNear = intersections.x;
                float tFar = intersections.y;

                vSceneIndex = sceneIndex;

                // Check if the point is behind or inside the cube
                float pointDistance = length(transformedSplatCenter.xyz - cameraPosition);
                if (pointDistance < tNear || tNear > tFar || tFar < 0.0) {
                    gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
                    return;
                };
            `;
        }

        if (enableOptionalEffects) {
            vertexShaderSource += `
                float splatOpacityFromScene = sceneOpacity[sceneIndex];
                int sceneVisible = sceneVisibility[sceneIndex];
                if (splatOpacityFromScene <= 0.01 || sceneVisible == 0) {
                    gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
                    return;
                }
            `;
        }

        if (dynamicMode) {
            vertexShaderSource += `
                mat4 transform = transforms[sceneIndex];
                mat4 transformModelViewMatrix = modelViewMatrix * transform;
            `;
        } else {
            vertexShaderSource += `mat4 transformModelViewMatrix = modelViewMatrix;`;
        }

        vertexShaderSource += `
            vec4 viewCenter = transformModelViewMatrix * vec4(splatCenter, 1.0);

            vec4 clipCenter = projectionMatrix * viewCenter;

            float clip = 1.2 * clipCenter.w;
            if (clipCenter.z < -clip || clipCenter.x < -clip || clipCenter.x > clip || clipCenter.y < -clip || clipCenter.y > clip) {
                gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
                return;
            }

            vec3 ndcCenter = clipCenter.xyz / clipCenter.w;

            vPosition = position.xy;
            vColor = uintToRGBAVec(sampledCenterColor.r);
        `;

        if (maxSphericalHarmonicsDegree >= 1) {

            vertexShaderSource += `   
            if (sphericalHarmonicsDegree >= 1) {
            `;

            if (dynamicMode) {
                vertexShaderSource += `
                    mat4 mTransform = modelMatrix * transform;
                    vec3 worldViewDir = normalize(splatCenter - vec3(inverse(mTransform) * vec4(cameraPosition, 1.0)));
                `;
            } else {
                vertexShaderSource += `
                    vec3 worldViewDir = normalize(splatCenter - cameraPosition);
                `;
            }

            vertexShaderSource += `
                vec3 sh1;
                vec3 sh2;
                vec3 sh3;
            `;

            if (maxSphericalHarmonicsDegree >= 2) {
                vertexShaderSource += `
                    vec4 sampledSH0123;
                    vec4 sampledSH4567;
                    vec4 sampledSH891011;

                    vec4 sampledSH0123R;
                    vec4 sampledSH0123G;
                    vec4 sampledSH0123B;
                    
                    if (sphericalHarmonicsMultiTextureMode == 0) {
                        sampledSH0123 = texture(sphericalHarmonicsTexture, getDataUV(6, 0, sphericalHarmonicsTextureSize));
                        sampledSH4567 = texture(sphericalHarmonicsTexture, getDataUV(6, 1, sphericalHarmonicsTextureSize));
                        sampledSH891011 = texture(sphericalHarmonicsTexture, getDataUV(6, 2, sphericalHarmonicsTextureSize));
                        sh1 = sampledSH0123.rgb;
                        sh2 = vec3(sampledSH0123.a, sampledSH4567.rg);
                        sh3 = vec3(sampledSH4567.ba, sampledSH891011.r);
                    } else {
                        sampledSH0123R = texture(sphericalHarmonicsTextureR, getDataUV(2, 0, sphericalHarmonicsTextureSize));
                        sampledSH0123G = texture(sphericalHarmonicsTextureG, getDataUV(2, 0, sphericalHarmonicsTextureSize));
                        sampledSH0123B = texture(sphericalHarmonicsTextureB, getDataUV(2, 0, sphericalHarmonicsTextureSize));
                        sh1 = vec3(sampledSH0123R.rgb);
                        sh2 = vec3(sampledSH0123G.rgb);
                        sh3 = vec3(sampledSH0123B.rgb);
                    }
                `;
            } else {
                vertexShaderSource += `
                    if (sphericalHarmonicsMultiTextureMode == 0) {
                        vec2 shUV = getDataUVF(nearestEvenIndex, 2.5, doubleOddOffset, sphericalHarmonicsTextureSize);
                        vec4 sampledSH0123 = texture(sphericalHarmonicsTexture, shUV);
                        shUV = getDataUVF(nearestEvenIndex, 2.5, doubleOddOffset + uint(1), sphericalHarmonicsTextureSize);
                        vec4 sampledSH4567 = texture(sphericalHarmonicsTexture, shUV);
                        shUV = getDataUVF(nearestEvenIndex, 2.5, doubleOddOffset + uint(2), sphericalHarmonicsTextureSize);
                        vec4 sampledSH891011 = texture(sphericalHarmonicsTexture, shUV);
                        sh1 = vec3(sampledSH0123.rgb) * (1.0 - fOddOffset) + vec3(sampledSH0123.ba, sampledSH4567.r) * fOddOffset;
                        sh2 = vec3(sampledSH0123.a, sampledSH4567.rg) * (1.0 - fOddOffset) + vec3(sampledSH4567.gba) * fOddOffset;
                        sh3 = vec3(sampledSH4567.ba, sampledSH891011.r) * (1.0 - fOddOffset) + vec3(sampledSH891011.rgb) * fOddOffset;
                    } else {
                        vec2 sampledSH01R = texture(sphericalHarmonicsTextureR, getDataUV(2, 0, sphericalHarmonicsTextureSize)).rg;
                        vec2 sampledSH23R = texture(sphericalHarmonicsTextureR, getDataUV(2, 1, sphericalHarmonicsTextureSize)).rg;
                        vec2 sampledSH01G = texture(sphericalHarmonicsTextureG, getDataUV(2, 0, sphericalHarmonicsTextureSize)).rg;
                        vec2 sampledSH23G = texture(sphericalHarmonicsTextureG, getDataUV(2, 1, sphericalHarmonicsTextureSize)).rg;
                        vec2 sampledSH01B = texture(sphericalHarmonicsTextureB, getDataUV(2, 0, sphericalHarmonicsTextureSize)).rg;
                        vec2 sampledSH23B = texture(sphericalHarmonicsTextureB, getDataUV(2, 1, sphericalHarmonicsTextureSize)).rg;
                        sh1 = vec3(sampledSH01R.rg, sampledSH23R.r);
                        sh2 = vec3(sampledSH01G.rg, sampledSH23G.r);
                        sh3 = vec3(sampledSH01B.rg, sampledSH23B.r);
                    }
                `;
            }

            vertexShaderSource += `
                    if (sphericalHarmonics8BitMode == 1) {
                        sh1 = sh1 * SphericalHarmonics8BitCompressionRange - vec8BitSHShift;
                        sh2 = sh2 * SphericalHarmonics8BitCompressionRange - vec8BitSHShift;
                        sh3 = sh3 * SphericalHarmonics8BitCompressionRange - vec8BitSHShift;
                    }
                    float x = worldViewDir.x;
                    float y = worldViewDir.y;
                    float z = worldViewDir.z;
                    vColor.rgb += SH_C1 * (-sh1 * y + sh2 * z - sh3 * x);
            `;

            if (maxSphericalHarmonicsDegree >= 2) {

                vertexShaderSource += `
                    if (sphericalHarmonicsDegree >= 2) {
                        float xx = x * x;
                        float yy = y * y;
                        float zz = z * z;
                        float xy = x * y;
                        float yz = y * z;
                        float xz = x * z;

                        vec3 sh4;
                        vec3 sh5;
                        vec3 sh6;
                        vec3 sh7;
                        vec3 sh8;

                        if (sphericalHarmonicsMultiTextureMode == 0) {
                            vec4 sampledSH12131415 = texture(sphericalHarmonicsTexture, getDataUV(6, 3, sphericalHarmonicsTextureSize));
                            vec4 sampledSH16171819 = texture(sphericalHarmonicsTexture, getDataUV(6, 4, sphericalHarmonicsTextureSize));
                            vec4 sampledSH20212223 = texture(sphericalHarmonicsTexture, getDataUV(6, 5, sphericalHarmonicsTextureSize));
                            sh4 = sampledSH891011.gba;
                            sh5 = sampledSH12131415.rgb;
                            sh6 = vec3(sampledSH12131415.a, sampledSH16171819.rg);
                            sh7 = vec3(sampledSH16171819.ba, sampledSH20212223.r);
                            sh8 = sampledSH20212223.gba;
                        } else {
                            vec4 sampledSH4567R = texture(sphericalHarmonicsTextureR, getDataUV(2, 1, sphericalHarmonicsTextureSize));
                            vec4 sampledSH4567G = texture(sphericalHarmonicsTextureG, getDataUV(2, 1, sphericalHarmonicsTextureSize));
                            vec4 sampledSH4567B = texture(sphericalHarmonicsTextureB, getDataUV(2, 1, sphericalHarmonicsTextureSize));
                            sh4 = vec3(sampledSH0123R.a, sampledSH4567R.rg);
                            sh5 = vec3(sampledSH4567R.ba, sampledSH0123G.a);
                            sh6 = vec3(sampledSH4567G.rgb);
                            sh7 = vec3(sampledSH4567G.a, sampledSH0123B.a, sampledSH4567B.r);
                            sh8 = vec3(sampledSH4567B.gba);
                        }

                        if (sphericalHarmonics8BitMode == 1) {
                            sh4 = sh4 * SphericalHarmonics8BitCompressionRange - vec8BitSHShift;
                            sh5 = sh5 * SphericalHarmonics8BitCompressionRange - vec8BitSHShift;
                            sh6 = sh6 * SphericalHarmonics8BitCompressionRange - vec8BitSHShift;
                            sh7 = sh7 * SphericalHarmonics8BitCompressionRange - vec8BitSHShift;
                            sh8 = sh8 * SphericalHarmonics8BitCompressionRange - vec8BitSHShift;
                        }

                        vColor.rgb +=
                            (SH_C2[0] * xy) * sh4 +
                            (SH_C2[1] * yz) * sh5 +
                            (SH_C2[2] * (2.0 * zz - xx - yy)) * sh6 +
                            (SH_C2[3] * xz) * sh7 +
                            (SH_C2[4] * (xx - yy)) * sh8;
                    }
                `;
            }

            vertexShaderSource += `
           
                vColor.rgb = clamp(vColor.rgb, vec3(0.), vec3(1.));

            }

            `;
        }

        return vertexShaderSource;
    }

    static getVertexShaderFadeIn() {
        return `
            if (fadeInComplete == 0) {
                float opacityAdjust = 1.0;
                float centerDist = length(splatCenter - sceneCenter);
                float renderTime = max(currentTime - firstRenderTime, 0.0);

                float fadeDistance = 0.75;
                float distanceLoadFadeInFactor = step(visibleRegionFadeStartRadius, centerDist);
                distanceLoadFadeInFactor = (1.0 - distanceLoadFadeInFactor) +
                                        (1.0 - clamp((centerDist - visibleRegionFadeStartRadius) / fadeDistance, 0.0, 1.0)) *
                                        distanceLoadFadeInFactor;
                opacityAdjust *= distanceLoadFadeInFactor;
                vColor.a *= opacityAdjust;
            }
        `;
    }

    static getUniforms(dynamicMode = false, enableOptionalEffects = false, maxSphericalHarmonicsDegree = 0,
                       splatScale = 1.0, pointCloudModeEnabled = false, useSplatRooms = false) {

        const uniforms = {
            'sceneCenter': {
                'type': 'v3',
                'value': new THREE.Vector3()
            },
            'fadeInComplete': {
                'type': 'i',
                'value': 0
            },
            'orthographicMode': {
                'type': 'i',
                'value': 0
            },
            'visibleRegionFadeStartRadius': {
                'type': 'f',
                'value': 0.0
            },
            'visibleRegionRadius': {
                'type': 'f',
                'value': 0.0
            },
            'currentTime': {
                'type': 'f',
                'value': 0.0
            },
            'firstRenderTime': {
                'type': 'f',
                'value': 0.0
            },
            'centersColorsTexture': {
                'type': 't',
                'value': null
            },
            'sphericalHarmonicsTexture': {
                'type': 't',
                'value': null
            },
            'sphericalHarmonicsTextureR': {
                'type': 't',
                'value': null
            },
            'sphericalHarmonicsTextureG': {
                'type': 't',
                'value': null
            },
            'sphericalHarmonicsTextureB': {
                'type': 't',
                'value': null
            },
            'focal': {
                'type': 'v2',
                'value': new THREE.Vector2()
            },
            'orthoZoom': {
                'type': 'f',
                'value': 1.0
            },
            'inverseFocalAdjustment': {
                'type': 'f',
                'value': 1.0
            },
            'viewport': {
                'type': 'v2',
                'value': new THREE.Vector2()
            },
            'basisViewport': {
                'type': 'v2',
                'value': new THREE.Vector2()
            },
            'debugColor': {
                'type': 'v3',
                'value': new THREE.Color()
            },
            'centersColorsTextureSize': {
                'type': 'v2',
                'value': new THREE.Vector2(1024, 1024)
            },
            'sphericalHarmonicsDegree': {
                'type': 'i',
                'value': maxSphericalHarmonicsDegree
            },
            'sphericalHarmonicsTextureSize': {
                'type': 'v2',
                'value': new THREE.Vector2(1024, 1024)
            },
            'sphericalHarmonics8BitMode': {
                'type': 'i',
                'value': 0
            },
            'sphericalHarmonicsMultiTextureMode': {
                'type': 'i',
                'value': 0
            },
            'splatScale': {
                'type': 'f',
                'value': splatScale
            },
            'pointCloudModeEnabled': {
                'type': 'i',
                'value': pointCloudModeEnabled ? 1 : 0
            }
        };

        if (dynamicMode || enableOptionalEffects || useSplatRooms) {
            uniforms['sceneIndexesTexture'] = {
                'type': 't',
                'value': null
            };
            uniforms['sceneIndexesTextureSize'] = {
                'type': 'v2',
                'value': new THREE.Vector2(1024, 1024)
            };
        }

        if (enableOptionalEffects) {
            const sceneOpacity = [];
            for (let i = 0; i < Constants.MaxScenes; i++) {
                sceneOpacity.push(1.0);
            }
            uniforms['sceneOpacity'] ={
                'type': 'f',
                'value': sceneOpacity
            };

            const sceneVisibility = [];
            for (let i = 0; i < Constants.MaxScenes; i++) {
                sceneVisibility.push(1);
            }
            uniforms['sceneVisibility'] ={
                'type': 'i',
                'value': sceneVisibility
            };
        }

        if (dynamicMode) {
            const transformMatrices = [];
            for (let i = 0; i < Constants.MaxScenes; i++) {
                transformMatrices.push(new THREE.Matrix4());
            }
            uniforms['transforms'] = {
                'type': 'mat4',
                'value': transformMatrices
            };
        }

        if (useSplatRooms) {
            const aabbMins = []
            for (let i = 0; i < Constants.MaxScenes; i++) {
                aabbMins.push(new THREE.Vector3(-1, -1, -1));
            }
            uniforms['aabbMins'] = {
                'type': 'v3',
                'value': aabbMins
            };
            const aabbMaxs = []
            for (let i = 0; i < Constants.MaxScenes; i++) {
                aabbMaxs.push(new THREE.Vector3(1, 1, 1));
            }
            uniforms['aabbMaxs'] = {
                'type': 'v3',
                'value': aabbMaxs
            };
            uniforms['maskTexture'] = {
                'type': 't',
                'value': null
            }
            uniforms['resolution'] = {
                'type': 'v2',
                'value': null
            }
        }

        return uniforms;
    }

}
