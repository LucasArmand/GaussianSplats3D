import * as THREE from 'three';

/**
 * SplatScene: Descriptor for a single splat scene managed by an instance of SplatMesh.
 */
export class SplatScene {

    constructor(splatBuffer, position = new THREE.Vector3(), quaternion = new THREE.Quaternion(),
                scale = new THREE.Vector3(1, 1, 1), minimumAlpha = 1, opacity = 1.0, visible = true,
                aabbMin = new THREE.Vector3(), aabbMax = new THREE.Vector3(), isSplatRoom = false) {
        this.splatBuffer = splatBuffer;
        this.position = position.clone();
        this.quaternion = quaternion.clone();
        this.scale = scale.clone();
        this.transform = new THREE.Matrix4();
        this.minimumAlpha = minimumAlpha;
        this.opacity = opacity;
        this.visible = visible;
        this.aabbMin = aabbMin.clone();
        this.aabbMax = aabbMax.clone();
        this.isSplatRoom = isSplatRoom;
        this.updateTransform();
    }

    copyTransformData(otherScene) {
        this.position.copy(otherScene.position);
        this.quaternion.copy(otherScene.quaternion);
        this.scale.copy(otherScene.scale);
        this.transform.copy(otherScene.transform);
    }

    updateTransform() {
        this.transform.compose(this.position, this.quaternion, this.scale);
    }
}
