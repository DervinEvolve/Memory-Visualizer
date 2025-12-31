declare module '@mkkellogg/gaussian-splats-3d' {
  export const WebXRMode: {
    None: number
    VR: number
    AR: number
  }

  export const RenderMode: {
    Always: number
    OnChange: number
    Never: number
  }

  export const SceneRevealMode: {
    Default: number
    Gradual: number
    Instant: number
  }

  export const LogLevel: {
    None: number
    Error: number
    Warning: number
    Info: number
    Debug: number
  }

  export interface ViewerOptions {
    selfDrivenMode?: boolean
    renderer?: THREE.WebGLRenderer
    camera?: THREE.Camera
    useBuiltInControls?: boolean
    ignoreDevicePixelRatio?: boolean
    gpuAcceleratedSort?: boolean
    sharedMemoryForWorkers?: boolean
    integerBasedSort?: boolean
    halfPrecisionCovariancesOnGPU?: boolean
    dynamicScene?: boolean
    webXRMode?: number
    renderMode?: number
    sceneRevealMode?: number
    antialiased?: boolean
    focalAdjustment?: number
    logLevel?: number
    sphericalHarmonicsDegree?: number
    cameraUp?: [number, number, number]
    initialCameraPosition?: [number, number, number]
    initialCameraLookAt?: [number, number, number]
    rootElement?: HTMLElement | null
    threeScene?: THREE.Scene
  }

  export interface SplatSceneOptions {
    splatAlphaRemovalThreshold?: number
    showLoadingUI?: boolean
    position?: [number, number, number]
    rotation?: [number, number, number, number]
    scale?: [number, number, number]
    progressiveLoad?: boolean
  }

  export class Viewer {
    constructor(options?: ViewerOptions)
    addSplatScene(url: string, options?: SplatSceneOptions): Promise<void>
    update(): void
    render(): void
    dispose(): void
  }
}
