package com.callumalpass.pickle.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val DarkColorScheme =
  darkColorScheme(
    primary = Action,
    secondary = Hold,
    tertiary = Reject,
    background = Charcoal,
    surface = DarkSurface,
    primaryContainer = Color(0xFF244C3B),
    secondaryContainer = Color(0xFF273D56),
    onBackground = Paper,
    onSurface = Paper,
    onPrimaryContainer = Paper,
    onSecondaryContainer = Paper,
  )

private val LightColorScheme =
  lightColorScheme(
    primary = Action,
    secondary = Hold,
    tertiary = Reject,
    background = Paper,
    surface = Color(0xFFFFFCF8),
    surfaceVariant = Color(0xFFEAF0E6),
    primaryContainer = Color(0xFFDDEFE5),
    secondaryContainer = Color(0xFFE4EEF8),
    outline = Line,
    onBackground = Ink,
    onSurface = Ink,
    onSurfaceVariant = MutedInk,
    onPrimaryContainer = Color(0xFF173927),
    onSecondaryContainer = Color(0xFF20354E),
  )

@Composable
fun PickleTheme(
  darkTheme: Boolean = isSystemInDarkTheme(),
  content: @Composable () -> Unit,
) {
  val colorScheme = if (darkTheme) DarkColorScheme else LightColorScheme

  MaterialTheme(colorScheme = colorScheme, typography = Typography, content = content)
}
