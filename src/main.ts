import "./style.css"
import Canvas from "./canvas"
import {
  initPhotoService,
  addPhotosFromFiles,
  getPhotoUrls,
  getPhotos,
  getAlbums,
  switchAlbum,
  createAlbum,
  updatePhotoSplatStatus,
  Photo,
  Album,
} from "./photoService"
import { sharpService } from "./sharpService"

class App {
  canvas!: Canvas
  isGeneratingSplats: boolean = false
  currentAlbums: Album[] = []
  readySplatsCount: number = 0

  constructor() {
    this.init()
  }

  async init() {
    // Initialize photo service
    const { albums } = await initPhotoService()
    this.currentAlbums = albums

    // Create canvas
    this.canvas = new Canvas()

    // Setup photo click handler
    this.canvas.onPhotoClick = (photoIndex: number) => {
      this.handlePhotoClick(photoIndex)
    }

    // Setup UI
    this.setupUploadUI()
    this.setupAlbumUI()
    this.setupSplatModal()

    // Hide instructions after interaction
    this.setupInstructionsHide()

    // Load any existing splats from photos
    this.loadExistingSplats()

    // Start render loop
    this.render()
  }

  /**
   * Handle click on a photo plane
   */
  handlePhotoClick(photoIndex: number) {
    const photos = getPhotos()
    const photo = photos[photoIndex]

    if (!photo) {
      console.warn(`[App] No photo at index ${photoIndex}`)
      return
    }

    console.log(`[App] Clicked photo: ${photo.name}, status: ${photo.splatStatus}`)

    if (photo.splatStatus === 'ready' && photo.splatUrl) {
      // Splat is ready - open viewer
      this.openSplatViewer(photo.id)
    } else if (photo.splatStatus === 'processing') {
      // Already processing - show status
      this.showStatus(`"${photo.name}" is being converted to 3D...`)
    } else if (photo.splatStatus === 'pending') {
      // Not yet processed - trigger generation
      this.showStatus(`Converting "${photo.name}" to 3D...`)
      this.generateSplatsForPhotos([photo])
    } else if (photo.splatStatus === 'failed') {
      // Failed - retry
      this.showStatus(`Retrying "${photo.name}"...`)
      this.generateSplatsForPhotos([photo])
    }
  }

  /**
   * Open the splat viewer for a specific photo
   */
  openSplatViewer(photoId: string) {
    if (!this.canvas.splatViewer) {
      this.canvas.initSplatViewer()
    }

    const splatViewer = this.canvas.splatViewer!
    if (splatViewer.hasSplat(photoId)) {
      splatViewer.open(photoId)
    } else {
      console.warn(`[App] No splat loaded for photo ${photoId}`)
    }
  }

  /**
   * Load splats from photos that already have splatUrl
   */
  loadExistingSplats() {
    const photos = getPhotos()
    for (const photo of photos) {
      if (photo.splatUrl && photo.splatStatus === 'ready') {
        this.canvas.addSplat(photo.id, photo.splatUrl)
        this.readySplatsCount++
      }
    }

    if (this.readySplatsCount > 0) {
      this.updateSplatCount()
    }
  }

  /**
   * Update splat count in status
   */
  updateSplatCount() {
    // Could show splat count in UI if needed
    console.log(`[App] ${this.readySplatsCount} splats ready`)
  }

  setupUploadUI() {
    const uploadBtn = document.getElementById("upload-btn")
    const photoInput = document.getElementById("photo-input") as HTMLInputElement

    if (!uploadBtn || !photoInput) return

    uploadBtn.addEventListener("click", () => {
      photoInput.click()
    })

    photoInput.addEventListener("change", async (e) => {
      const files = (e.target as HTMLInputElement).files
      if (!files || files.length === 0) return

      this.showStatus(`Adding ${files.length} photo(s)...`)

      try {
        const newPhotos = await addPhotosFromFiles(files)

        // Reload visualization
        const urls = getPhotoUrls()
        await this.canvas.planes.reloadPhotos(urls)

        this.showStatus(`Added ${newPhotos.length} photo(s)! Click any photo to view in 3D.`, false)
        setTimeout(() => this.hideStatus(), 3000)

        // Update album UI
        this.updateAlbumSelector()

        // Don't auto-generate splats - only generate when user clicks a photo

        photoInput.value = ""
      } catch (err) {
        console.error("Failed to add photos:", err)
        this.showStatus("Failed to add photos", false)
      }
    })
  }

  setupAlbumUI() {
    const albumSelector = document.getElementById("album-selector")
    const albumSelect = document.getElementById("album-select") as HTMLSelectElement
    const newAlbumBtn = document.getElementById("new-album-btn")

    if (!albumSelect || !newAlbumBtn) return

    // Show album selector if we have albums
    this.updateAlbumSelector()

    // Handle album change
    albumSelect.addEventListener("change", async (e) => {
      const albumId = (e.target as HTMLSelectElement).value
      this.showStatus("Loading album...")

      await switchAlbum(albumId)
      const urls = getPhotoUrls()
      await this.canvas.planes.reloadPhotos(urls)

      this.hideStatus()
    })

    // Handle new album
    newAlbumBtn.addEventListener("click", async () => {
      const name = prompt("Enter album name:")
      if (!name) return

      await createAlbum(name)
      this.updateAlbumSelector()
    })
  }

  updateAlbumSelector() {
    const albumSelector = document.getElementById("album-selector")
    const albumSelect = document.getElementById("album-select") as HTMLSelectElement

    if (!albumSelector || !albumSelect) return

    const albums = getAlbums()
    this.currentAlbums = albums

    // Show selector if multiple albums
    if (albums.length > 1) {
      albumSelector.style.display = "block"
    }

    // Update options
    albumSelect.innerHTML = albums
      .map(a => `<option value="${a.id}">${a.name} (${a.photoCount})</option>`)
      .join("")
  }

  setupSplatModal() {
    const modal = document.getElementById("splat-modal")
    const closeBtn = document.getElementById("close-splat")

    if (!modal || !closeBtn) return

    closeBtn.addEventListener("click", () => {
      modal.style.display = "none"
    })

    // Close on background click
    modal.addEventListener("click", (e) => {
      if (e.target === modal) {
        modal.style.display = "none"
      }
    })

    // Close on escape
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        modal.style.display = "none"
      }
    })
  }

  setupInstructionsHide() {
    const instructions = document.getElementById("instructions")
    if (!instructions) return

    // Hide after first interaction
    const hide = () => {
      instructions.style.transition = "opacity 0.5s"
      instructions.style.opacity = "0"
      setTimeout(() => {
        instructions.style.display = "none"
      }, 500)
      window.removeEventListener("pointerdown", hide)
      window.removeEventListener("wheel", hide)
    }

    window.addEventListener("pointerdown", hide)
    window.addEventListener("wheel", hide)
  }

  showStatus(text: string, showSpinner = true) {
    const statusBar = document.getElementById("status-bar")
    const statusText = document.getElementById("status-text")
    const statusSpinner = document.getElementById("status-spinner")

    if (!statusBar || !statusText) return

    statusBar.style.display = "block"
    statusText.textContent = text
    if (statusSpinner) {
      statusSpinner.style.display = showSpinner ? "block" : "none"
    }
  }

  hideStatus() {
    const statusBar = document.getElementById("status-bar")
    if (statusBar) {
      statusBar.style.display = "none"
    }
  }

  async generateSplatsForPhotos(photos: Photo[]) {
    if (this.isGeneratingSplats) return
    this.isGeneratingSplats = true

    for (const photo of photos) {
      if (photo.splatStatus !== "pending") continue

      try {
        await updatePhotoSplatStatus(photo.id, "processing")
        this.showStatus(`Converting "${photo.name}" to 3D...`)

        const result = await sharpService.generateSplatFromBlob(
          photo.blob,
          photo.name,
          (progress) => this.showStatus(`${photo.name}: ${progress}`)
        )

        await updatePhotoSplatStatus(photo.id, "ready", result.plyUrl)
        console.log(`[App] Splat ready: ${result.plyUrl}`)

        // Add to splat viewer
        this.canvas.addSplat(photo.id, result.plyUrl)
        this.readySplatsCount++
        this.updateSplatCount()
      } catch (err) {
        console.error(`[App] Splat generation failed for ${photo.name}:`, err)
        await updatePhotoSplatStatus(photo.id, "failed")
      }
    }

    this.isGeneratingSplats = false
    this.showStatus("All memories converted to 3D!", false)

    setTimeout(() => this.hideStatus(), 3000)
  }

  showSplat(plyUrl: string) {
    const modal = document.getElementById("splat-modal")
    const loading = document.getElementById("splat-loading")
    const container = document.getElementById("splat-container")

    if (!modal || !container) return

    modal.style.display = "flex"
    if (loading) loading.style.display = "flex"

    // TODO: Initialize Luma or Three.js Gaussian splat viewer
    // For now, just log the URL
    console.log("[App] Would load splat:", plyUrl)

    // Hide loading after a moment (placeholder)
    setTimeout(() => {
      if (loading) loading.textContent = `Splat URL: ${plyUrl}`
    }, 1000)
  }

  render() {
    this.canvas?.render()
    requestAnimationFrame(this.render.bind(this))
  }
}

export default new App()
