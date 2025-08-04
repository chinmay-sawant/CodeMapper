package middleware

import (
	"fmt"
	"time"

	"github.com/gin-gonic/gin"
)

func Logger() gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		c.Next()
		latency := time.Since(start)
		statusCode := c.Writer.Status()
		clientIP := c.ClientIP()
		method := c.Request.Method
		path := c.Request.URL.Path
		proto := c.Request.Proto
		userAgent := c.Request.UserAgent()
		errorMessage := c.Errors.ByType(gin.ErrorTypePrivate).String()
		fmt.Printf("%s - [%s] \"%s %s %s %s %d \"%s\" %s\" %s\n",
			clientIP,
			clientIP,
			start.Format(time.RFC1123),
			method,
			path,
			proto,
			statusCode,
			latency,
			userAgent,
			errorMessage,
		)
	}
}
