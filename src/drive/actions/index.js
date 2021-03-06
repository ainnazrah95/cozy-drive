/* global cozy */
import { getAdapter, extractFileAttributes } from './async'
import {
  getSort,
  getLoadedFilesCount,
  getLoadedFoldersCount
} from '../reducers'
import { isCordova } from '../mobile/lib/device'
import {
  saveFileWithCordova,
  saveAndOpenWithCordova,
  openOfflineFile,
  deleteOfflineFile
} from '../mobile/lib/filesystem'
import { openWithNoAppError } from '../mobile/actions'
import {
  isDirectory,
  isReferencedByAlbum,
  ALBUMS_DOCTYPE
} from '../ducks/files/files'
import { revokeLink as revokeSharingLink } from 'cozy-client'
import * as availableOffline from '../ducks/files/availableOffline'

import { ROOT_DIR_ID, TRASH_DIR_ID } from '../constants/config.js'

export const OPEN_FOLDER = 'OPEN_FOLDER'
export const OPEN_FOLDER_SUCCESS = 'OPEN_FOLDER_SUCCESS'
export const OPEN_FOLDER_FAILURE = 'OPEN_FOLDER_FAILURE'
export const SORT_FOLDER = 'SORT_FOLDER'
export const SORT_FOLDER_SUCCESS = 'SORT_FOLDER_SUCCESS'
export const SORT_FOLDER_FAILURE = 'SORT_FOLDER_FAILURE'
export const FETCH_RECENT = 'FETCH_RECENT'
export const FETCH_RECENT_SUCCESS = 'FETCH_RECENT_SUCCESS'
export const FETCH_RECENT_FAILURE = 'FETCH_RECENT_FAILURE'
export const FETCH_MORE_FILES = 'FETCH_MORE_FILES'
export const FETCH_MORE_FILES_SUCCESS = 'FETCH_MORE_FILES_SUCCESS'
export const FETCH_MORE_FILES_FAILURE = 'FETCH_MORE_FILES_FAILURE'
export const ABORT_ADD_FOLDER = 'ABORT_ADD_FOLDER'
export const CREATE_FOLDER = 'CREATE_FOLDER'
export const CREATE_FOLDER_FAILURE_GENERIC = 'CREATE_FOLDER_FAILURE_GENERIC'
export const CREATE_FOLDER_FAILURE_DUPLICATE = 'CREATE_FOLDER_FAILURE_DUPLICATE'
export const CREATE_FOLDER_SUCCESS = 'CREATE_FOLDER_SUCCESS'
export const UPLOAD_FILE_SUCCESS = 'UPLOAD_FILE_SUCCESS'
export const TRASH_FILES = 'TRASH_FILES'
export const TRASH_FILES_SUCCESS = 'TRASH_FILES_SUCCESS'
export const TRASH_FILES_FAILURE = 'TRASH_FILES_FAILURE'
export const DOWNLOAD_SELECTION = 'DOWNLOAD_SELECTION'
export const DOWNLOAD_FILE = 'DOWNLOAD_FILE'
export const DOWNLOAD_FILE_E_MISSING = 'DOWNLOAD_FILE_E_MISSING'
export const DOWNLOAD_FILE_E_OFFLINE = 'DOWNLOAD_FILE_E_OFFLINE'
export const OPEN_FILE_WITH = 'OPEN_FILE_WITH'
export const OPEN_FILE_E_OFFLINE = 'OPEN_FILE_E_OFFLINE'
export const OPEN_FILE_E_NO_APP = 'OPEN_FILE_E_NO_APP'

// selectors

export const getOpenedFolderId = state => state.view.openedFolderId

const HTTP_CODE_CONFLICT = 409
const ALERT_LEVEL_ERROR = 'error'

export const META_DEFAULTS = {
  cancelSelection: true,
  hideActionMenu: true
}

export const openFiles = () => {
  return async dispatch => dispatch(openFolder(ROOT_DIR_ID))
}

export const openRecent = () => {
  return async dispatch => dispatch(fetchRecentFiles())
}

export const openTrash = () => {
  return async dispatch => dispatch(openFolder(TRASH_DIR_ID))
}

export const openFolder = folderId => {
  return async (dispatch, getState) => {
    dispatch({
      type: OPEN_FOLDER,
      folderId,
      meta: {
        cancelSelection: true
      }
    })
    try {
      // PB: Pouch Mango queries don't return the total count...
      // and so the fetchMore button would not be displayed unless... see FileList
      const folder = await getAdapter(getState()).getFolder(folderId)

      return dispatch({
        type: OPEN_FOLDER_SUCCESS,
        folder,
        fileCount: folder.contents.meta.count || 0,
        files: folder.contents.data
      })
    } catch (err) {
      return dispatch({ type: OPEN_FOLDER_FAILURE, error: err })
    }
  }
}

export const sortFolder = (folderId, sortAttribute, sortOrder = 'asc') => {
  return async (dispatch, getState) => {
    dispatch({
      type: SORT_FOLDER,
      folderId,
      sortAttribute,
      sortOrder,
      meta: {
        cancelSelection: true
      }
    })
    try {
      const files = await getAdapter(getState()).getSortedFolder(
        folderId,
        sortAttribute,
        sortOrder
      )

      return dispatch({
        type: SORT_FOLDER_SUCCESS,
        files
      })
    } catch (err) {
      return dispatch({ type: SORT_FOLDER_FAILURE, error: err })
    }
  }
}

export const fetchMoreFiles = (folderId, skip, limit) => {
  return async (dispatch, getState) => {
    const sort = getSort(getState())
    dispatch({ type: FETCH_MORE_FILES, folderId, skip, limit })
    try {
      const files =
        sort === null
          ? await getAdapter(getState()).getFolderContents(
              folderId,
              skip,
              limit
            )
          : await getAdapter(getState()).getSortedFolder(
              folderId,
              sort.attribute,
              sort.order,
              skip,
              limit,
              getLoadedFoldersCount(getState()),
              getLoadedFilesCount(getState())
            )
      return dispatch({
        type: FETCH_MORE_FILES_SUCCESS,
        files,
        skip,
        limit
      })
    } catch (err) {
      return dispatch({ type: FETCH_MORE_FILES_FAILURE, error: err })
    }
  }
}

export const fetchRecentFiles = () => {
  return async (dispatch, getState) => {
    dispatch({
      type: FETCH_RECENT,
      meta: {
        cancelSelection: true
      }
    })

    try {
      const files = await getAdapter(getState()).getRecentFiles()
      // fetch the list of parent dirs to get the path of recent files
      const parentDirIds = files
        .map(f => f.dir_id)
        .filter((value, index, self) => self.indexOf(value) === index)

      const parentFolders = await getAdapter(getState()).getFilesInBatch(
        parentDirIds
      )

      const filesWithPath = files.map(file => {
        const parentFolder = parentFolders.rows.find(
          row => row.id === file.dir_id
        )
        const path = parentFolder ? parentFolder.doc.path : ''
        return { ...file, path, id: file._id }
      })

      return dispatch({
        type: FETCH_RECENT_SUCCESS,
        fileCount: filesWithPath.length,
        files: filesWithPath
      })
    } catch (e) {
      return dispatch({ type: FETCH_RECENT_FAILURE, error: e })
    }
  }
}

export const getFileDownloadUrl = async id => {
  const link = await cozy.client.files.getDownloadLinkById(id)
  return `${cozy.client._url}${link}`
}

export const openLocalFile = file => {
  return async dispatch => {
    if (!file.availableOffline) {
      console.error('openLocalFile: this file is not available offline')
    }
    openOfflineFile(file).catch(error => {
      console.error('openLocalFile', error)
      dispatch(
        openWithNoAppError({
          cancelSelection: true,
          hideActionMenu: true
        })
      )
    })
  }
}

export const uploadedFile = file => {
  return (dispatch, getState) => {
    return dispatch({
      type: UPLOAD_FILE_SUCCESS,
      file: extractFileAttributes(file),
      currentFileCount: getState().view.fileCount,
      currentSort: getSort(getState())
    })
  }
}

export const abortAddFolder = accidental => {
  const action = {
    type: ABORT_ADD_FOLDER,
    accidental
  }
  if (accidental) {
    action.alert = {
      message: 'alert.folder_abort'
    }
  }
  return action
}

export const createFolder = name => {
  return async (dispatch, getState) => {
    const existingFolder = getState().view.files.find(
      f => isDirectory(f) && f.name === name
    )
    const currentFileCount = getState().view.fileCount
    if (existingFolder) {
      dispatch({
        type: CREATE_FOLDER_FAILURE_DUPLICATE,
        alert: {
          message: 'alert.folder_name',
          messageData: { folderName: name }
        }
      })
      throw new Error('alert.folder_name')
    }

    dispatch({
      type: CREATE_FOLDER,
      name
    })

    try {
      const folder = await cozy.client.files.createDirectory({
        name: name,
        dirID: getState().view.displayedFolder.id
      })
      const sort = getSort(getState())
      dispatch({
        type: CREATE_FOLDER_SUCCESS,
        folder: extractFileAttributes(folder),
        currentFileCount,
        currentSort: sort
      })
    } catch (err) {
      if (err.response && err.response.status === HTTP_CODE_CONFLICT) {
        dispatch({
          type: CREATE_FOLDER_FAILURE_DUPLICATE,
          alert: {
            message: 'alert.folder_name',
            messageData: { folderName: name }
          }
        })
      } else {
        dispatch({
          type: CREATE_FOLDER_FAILURE_GENERIC,
          alert: {
            message: 'alert.folder_generic'
          }
        })
      }
      throw err
    }
  }
}

export const trashFiles = files => {
  const meta = META_DEFAULTS
  return async dispatch => {
    dispatch({ type: TRASH_FILES, files, meta })
    const trashed = []
    try {
      for (const file of files) {
        trashed.push(await cozy.client.files.trashById(file.id))

        if (isReferencedByAlbum(file)) {
          for (const ref of file.relationships.referenced_by.data) {
            if (ref.type === ALBUMS_DOCTYPE) {
              await cozy.client.data.removeReferencedFiles(
                { _type: ref.type, _id: ref.id },
                file.id
              )
            }
          }
        }

        dispatch(revokeSharingLink(file))
      }
    } catch (err) {
      if (!isAlreadyInTrash(err)) {
        return dispatch({
          type: TRASH_FILES_FAILURE,
          alert: {
            message: 'alert.try_again'
          }
        })
      }
    }
    return dispatch({
      type: TRASH_FILES_SUCCESS,
      ids: files.map(f => f.id),
      alert: {
        message: 'alert.trash_file_success'
      }
    })
  }
}

export const downloadFiles = files => {
  const meta = META_DEFAULTS
  return async dispatch => {
    if (files.length === 1 && !isDirectory(files[0])) {
      return dispatch(downloadFile(files[0], meta))
    }
    const paths = files.map(f => f.path)
    const href = await cozy.client.files.getArchiveLinkByPaths(paths)
    const fullpath = await cozy.client.fullpath(href)
    forceFileDownload(fullpath, 'files.zip')
    return dispatch({ type: DOWNLOAD_SELECTION, files, meta })
  }
}

export const toggleAvailableOffline = file => async (dispatch, getState) =>
  availableOffline.isAvailableOffline(getState())(file.id)
    ? dispatch(undoMakeAvailableOffline(file))
    : dispatch(makeAvailableOffline(file))

const undoMakeAvailableOffline = file => async dispatch => {
  const filename = file.id
  if (isCordova() && window.cordova.file) {
    deleteOfflineFile(filename)
  }
  dispatch(availableOffline.undoMakeAvailableOffline(file.id))
}

const makeAvailableOffline = file => async dispatch => {
  const response = await cozy.client.files
    .downloadById(file.id)
    .catch(error => {
      dispatch(downloadFileError(error, META_DEFAULTS))
      throw error
    })
  const blob = await response.blob()
  const filename = file.id

  if (isCordova() && window.cordova.file) {
    saveFileWithCordova(blob, filename)
  }
  dispatch(availableOffline.makeAvailableOffline(file.id))
}

const isMissingFile = error => error.status === 404

const downloadFileError = (error, meta) => {
  const message = isMissingFile(error)
    ? 'error.download_file.missing'
    : 'error.download_file.offline'
  const type = isMissingFile(error)
    ? DOWNLOAD_FILE_E_MISSING
    : DOWNLOAD_FILE_E_OFFLINE
  return { type, alert: { message, level: ALERT_LEVEL_ERROR }, meta }
}

const downloadFile = (file, meta) => {
  return async dispatch => {
    const response = await cozy.client.files
      .downloadById(file.id)
      .catch(error => {
        dispatch(downloadFileError(error, meta))
        throw error
      })
    const blob = await response.blob()
    const filename = file.name

    if (isCordova() && window.cordova.file) {
      saveFileWithCordova(blob, filename)
    } else {
      forceFileDownload(window.URL.createObjectURL(blob), filename)
    }
    return dispatch({ type: DOWNLOAD_FILE, file, meta })
  }
}

const forceFileDownload = (href, filename) => {
  const element = document.createElement('a')
  element.setAttribute('href', href)
  element.setAttribute('download', filename)
  element.style.display = 'none'
  document.body.appendChild(element)
  element.click()
  document.body.removeChild(element)
}

export const openFileWith = (id, filename) => {
  const meta = {
    cancelSelection: true,
    hideActionMenu: true
  }
  return async (dispatch, getState) => {
    if (isCordova() && window.cordova.plugins.fileOpener2) {
      dispatch({ type: OPEN_FILE_WITH, id })
      const response = await cozy.client.files.downloadById(id).catch(error => {
        console.error('downloadById', error)
        dispatch(downloadFileError(error, meta))
        throw error
      })
      const blob = await response.blob()
      await saveAndOpenWithCordova(blob, filename).catch(error => {
        console.error('openFileWithCordova', error)
        dispatch(openWithNoAppError(meta))
      })
    } else {
      dispatch(openWithNoAppError(meta))
    }
  }
}

// helpers
const isAlreadyInTrash = err => {
  const reasons = err.reason !== undefined ? err.reason.errors : undefined
  if (reasons) {
    for (const reason of reasons) {
      if (reason.detail === 'File or directory is already in the trash') {
        return true
      }
    }
  }
  return false
}
