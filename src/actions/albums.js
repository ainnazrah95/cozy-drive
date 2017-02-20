/**
  Albums related features
**/

import {
  ADD_TO_ALBUM,
  CANCEL_ADD_TO_ALBUM
} from '../constants/actionTypes'

// create album
export const addToAlbum = (id = null, photos = []) => {
  return async dispatch => {
    if (id) {
      // Call cozy client to create album
    } else {
      dispatch({
        type: ADD_TO_ALBUM,
        id: id,
        photos: photos
      })
    }
  }
}

export const cancelAddToAlbum = (photos = []) => {
  return async dispatch => {
    dispatch({
      type: CANCEL_ADD_TO_ALBUM,
      photos: photos
    })
  }
}
